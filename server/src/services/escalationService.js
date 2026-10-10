const db = require('../config/database');
const { sendSMS, getTemplate } = require('./smsService');
const { logAudit } = require('./auditService');
const { renderCourtLetterPng, isImageRenderingAvailable } = require('./courtLetterImageService');
const { signCourtLetterToken } = require('./courtLetterToken');
const { buildPublicUrl, hasPublicBaseUrl } = require('../config/publicUrl');

// A Dube that passes its due date opens an escalation case. On that first day the
// customer is warned by SMS; no court letter exists yet. The merchant then waits
// WARNING_PERIOD_DAYS, and only after that full 7-day warning may they issue and
// send the court letter (which publishes the letter as an image on the customer's
// Smart Dube page), and the sweep never sends that notice on the creditor's behalf.
const WARNING_PERIOD_DAYS = 7;

// pg returns DATE columns as a Date at local midnight, so toISOString() would
// roll the calendar day back for anyone east of UTC. Read the local parts.
function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).split('T')[0];
}

function formatHumanDate(value) {
  const iso = toDateOnly(value);
  if (!iso) return 'N/A';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function addDays(value, days) {
  const iso = toDateOnly(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Whole days elapsed since a timestamp. Guards against a missing or malformed
// value instead of producing NaN, which previously leaked into daysRemaining.
function daysSince(timestamp) {
  if (!timestamp) return 0;
  const then = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
}

function buildCourtLetterRef(caseId, issuedOn) {
  return `CL-${caseId}-${String(toDateOnly(issuedOn) || '').replace(/-/g, '')}`;
}

/**
 * Build the full legal notice shown on the customer.
 *
 * The notice is described ONCE here, as structured data, and then rendered twice:
 * as plain text (snapshotted into escalation_cases.court_letter_body, and used
 * for the accessible copy on the portal) and as a formal court-styled image
 * (sent as MMS media and displayed on the portal). Deriving both from the same
 * object is what stops the SMS and the document from drifting apart.
 *
 * The text is snapshotted at the moment the letter is issued. A legal notice must
 * not silently change after the fact, so the store name, address and amount are
 * frozen here rather than re-read from live rows every time the page renders.
 */
function buildCourtLetterDocument({
  letterRef,
  customerName,
  faydaId,
  customerPhone,
  storeName,
  merchantAddress,
  businessLicenseNo,
  amount,
  dueDate,
  warningSentAt,
  issuedAt,
  graceDays
}) {
  const amountText = `${parseFloat(amount).toFixed(2)} ETB`;
  const issuedOnHuman = formatHumanDate(issuedAt);
  const dueDateHuman = formatHumanDate(dueDate);

  const title = 'FINAL NOTICE AND WARNING OF LEGAL ACTION';

  const priorWarning = warningSentAt
    ? `An overdue warning was issued to you on ${formatTimestamp(warningSentAt)}, ` +
      `giving you a grace period of ${graceDays} days to settle the debt. ` +
      'That grace period has now expired without payment.'
    : 'You were notified of this overdue debt and given a grace period of ' +
      `${graceDays} days to settle it. That grace period has now expired without payment.`;

  const consequences =
    `If payment is not received in full within that period, this shop will refer ` +
    `your account to the appropriate court of law and institute legal proceedings ` +
    `to recover the debt, together with any lawful costs of collection. We reserve the ` +
    `right to report the unpaid balance to relevant credit reference and ` +
    `consumer protection authorities.`;

  const standing = 'Settling this debt in full will close this notice immediately and no legal action will be taken against you.';

  const issuerNote =
    'This notice is a formal record of the debt and of the opportunity given to you ' +
    'to settle it. It is not a waiver of any right available to the creditor.';

  // Shared by both renderings.
  const clauses = [
    {
      number: 1,
      heading: 'This notice is a final warning of legal action',
      body: [
        `Our records show that credit goods were supplied to you on credit by ${storeName}, ` +
        `in the total amount of ${amountText}. The agreed repayment deadline of ` +
        `${dueDateHuman} has passed and the debt remains unpaid in full.`
      ]
    },
    { number: 2, heading: 'Prior warning', body: [priorWarning] },
    {
      number: 3,
      heading: 'What happens next',
      body: [
        `You have a final period of ${graceDays} days from the date of this notice to ` +
        `settle the full outstanding amount of ${amountText}.`,
        consequences,
        standing
      ]
    }
  ];

  const text = [
    title,
    `Reference: ${letterRef}`,
    '',
    'To:      ' + customerName + (faydaId ? ` (Fayda ID: ${faydaId})` : ''),
    'From:    ' + storeName,
    merchantAddress ? 'Address:  ' + merchantAddress : null,
    businessLicenseNo ? 'License:  ' + businessLicenseNo : null,
    '',
    `Date of issue: ${issuedOnHuman}`,
    '',
    ...clauses.flatMap((clause) => [
      `${clause.number}. ${clause.heading.toUpperCase()}`,
      '',
      ...clause.body.flatMap((para) => [para, ''])
    ]),
    issuerNote,
    '',
    'Issued automatically by Smart Dube on behalf of the creditor named above.'
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    text,
    image: {
      letterRef,
      title,
      subject: 'Overdue Dube credit balance - immediate settlement required',
      issuedOnHuman,
      dueDateHuman,
      amountText,
      customer: { name: customerName, faydaId: faydaId || null, phone: customerPhone || null },
      creditor: {
        storeName,
        address: merchantAddress || null,
        license: businessLicenseNo || null
      },
      clauses,
      issuerNote
    }
  };
}

/**
 * Text-only accessor, kept because it is the shape snapshotted into the database.
 */
function buildCourtLetterBody(args) {
  return buildCourtLetterDocument(args).text;
}

async function loadEscalationCase(caseId) {
  return await db.get(
    `SELECT ec.*, cp.full_name as customer_name, cp.phone as customer_phone, cp.fayda_id,
            m.store_name, m.address as merchant_address, m.business_license_no
     FROM escalation_cases ec
     JOIN customer_profiles cp ON ec.customer_id = cp.id
     JOIN merchants m ON ec.merchant_id = m.id
     WHERE ec.id = $1`,
    [caseId]
  );
}

async function createEscalationCase(customerId, merchantId, transactionId, amount, dueDate) {
  // Look for ANY open case on this transaction, not just one still typed
  // 'WARNING'. The previous filter keyed on escalation_type, so once a case
  // advanced to 'COURT_LETTER' the next sweep no longer matched it and opened a
  // second case, re-warning a customer who had already been legally notified.
  const existing = await db.get(
    `SELECT id, escalation_type, status, warning_period_days, warning_sent_at,
            court_letter_ref, court_letter_sent_at
     FROM escalation_cases
     WHERE customer_id = $1 AND transaction_id = $2
       AND status NOT IN ('RESOLVED', 'CLOSED')
     ORDER BY id DESC
     LIMIT 1`,
    [customerId, transactionId]
  );

  if (existing) {
    return { alreadyExists: true, caseId: existing.id, case: existing };
  }

  const result = await db.get(
    `INSERT INTO escalation_cases (customer_id, merchant_id, transaction_id, escalation_type, amount, due_date, status, warning_period_days)
     VALUES ($1, $2, $3, 'WARNING', $4, $5, 'PENDING', $6) RETURNING id`,
    [customerId, merchantId, transactionId, amount, dueDate, WARNING_PERIOD_DAYS]
  );

  return { alreadyExists: false, caseId: result.id, case: null };
}

/**
 * Issue the court letter for a case: snapshot the notice and publish it as an
 * image on the customer's Smart Dube page.
 *
 * Issuing and notifying are the same act here by design: the letter is created
 * only when the merchant sends it, which the 7-day warning gate guarantees is
 * never before the warning is over. The portal and the SMS both read from the
 * same immutable snapshot.
 *
 * Idempotent: a case that already carries a document gets that document back
 * rather than a second letter. A duplicate legal notice on one debt is never a
 * thing this code should produce on its own.
 */
async function issueCourtLetter(caseId, escalationCase, options = {}) {
  const { trigger = 'MANUAL' } = options;

  if (escalationCase.court_letter_doc) {
    return {
      letterRef: escalationCase.court_letter_ref,
      courtLetterBody: escalationCase.court_letter_body,
      courtLetterDoc: escalationCase.court_letter_doc,
      alreadyIssued: true
    };
  }

  const graceDays = escalationCase.warning_period_days || WARNING_PERIOD_DAYS;
  const issuedAt = new Date();
  const letterRef = buildCourtLetterRef(caseId, issuedAt);

  // One structured description of the notice, rendered to both text and image.
  const letter = buildCourtLetterDocument({
    letterRef,
    customerName: escalationCase.customer_name,
    faydaId: escalationCase.fayda_id,
    customerPhone: escalationCase.customer_phone,
    storeName: escalationCase.store_name,
    merchantAddress: escalationCase.merchant_address,
    businessLicenseNo: escalationCase.business_license_no,
    amount: escalationCase.amount,
    dueDate: escalationCase.due_date,
    warningSentAt: escalationCase.warning_sent_at,
    issuedAt,
    graceDays
  });

  const courtLetterBody = letter.text;

  // Persist the notice before anything is sent, so no message can claim a
  // document exists that failed to save. The structured doc goes in alongside
  // the text so the rendered image is guaranteed to match this snapshot.
  await db.run(
    `UPDATE escalation_cases
     SET escalation_type = 'COURT_LETTER',
         status = 'SENT',
         court_letter_ref = $2,
         court_letter_body = $3,
         court_letter_doc = $4::jsonb,
         court_letter_issued_at = NOW(),
         updated_at = NOW(),
         notes = CASE WHEN $5 = 'AUTO' THEN 'Court letter issued to the customer page by the daily debt sweep, alongside the overdue warning.'
                   ELSE COALESCE(notes, 'Court letter issued by merchant.') END
     WHERE id = $1`,
    [caseId, letterRef, courtLetterBody, JSON.stringify(letter.image), trigger]
  );

  // Render now so a font or renderer problem surfaces at issue time rather than
  // when the customer happens to open the page. The result is cached, so this
  // cost is paid once per letter.
  let imageRendered = false;
  if (isImageRenderingAvailable()) {
    try {
      renderCourtLetterPng(letter.image);
      imageRendered = true;
    } catch (err) {
      console.error(`[COURT LETTER] Case #${caseId}: image render failed, publishing text only. ${err.message}`);
    }
  } else {
    console.warn(`[COURT LETTER] Case #${caseId}: image rendering unavailable, publishing text only.`);
  }

  return {
    letterRef,
    courtLetterBody,
    courtLetterDoc: letter.image,
    imageRendered,
    alreadyIssued: false
  };
}

/**
 * First rung of the ladder: the Dube is overdue, so the customer is warned by
 * SMS only. No court letter is issued or published here — for the whole 7-day
 * warning the customer is meant to see a warning, nothing legal. The court
 * letter is only created and put on their page when the merchant sends it, a
 * full warning week later.
 */
async function sendWarning(caseId, options = {}) {
  const { trigger = 'MANUAL', actorUserId = null, actorName = 'System' } = options;

  const escalationCase = await loadEscalationCase(caseId);

  if (!escalationCase) {
    throw new Error('Escalation case not found.');
  }

  if (escalationCase.court_letter_sent_at) {
    throw new Error('The court letter has already been sent to this customer, so no further warning can be sent.');
  }

  const message = getTemplate('OVERDUE_ALERT', {
    customerName: escalationCase.customer_name,
    storeName: escalationCase.store_name,
    amount: parseFloat(escalationCase.amount).toFixed(2),
    dueDate: formatHumanDate(escalationCase.due_date)
  });

  const smsResult = await sendSMS({
    customerId: escalationCase.customer_id,
    phone: escalationCase.customer_phone,
    message,
    type: 'OVERDUE_ALERT'
  });

  await db.run(
    `UPDATE escalation_cases
     SET status = 'SENT', warning_sent_at = NOW(), updated_at = NOW(),
         notes = CASE WHEN $2 = 'AUTO' THEN 'Overdue warning sent automatically by the daily debt sweep.'
                   ELSE COALESCE(notes, 'Overdue warning sent by merchant.') END
     WHERE id = $1`,
    [caseId, trigger]
  );

  logAudit({
    userId: actorUserId,
    actorName: actorName,
    action: 'ESCALATION_WARNING_SENT',
    resource: `Escalation Case #${caseId}`,
    details: {
      customerId: escalationCase.customer_id,
      amount: escalationCase.amount,
      gateway: smsResult.gateway,
      trigger
    }
  });

  return { escalationCase, smsResult, trigger };
}

/**
 * Same-origin path to the signed letter image, or null when PNG rendering is
 * unavailable. This is what the customer portal uses: the browser is already
 * talking to this server, so a relative path resolves correctly on localhost
 * and in production alike. Keeping it separate from the absolute URL is what
 * lets the letter be previewed in local development, where no public address
 * exists.
 */
function buildCourtLetterImagePath(caseId) {
  if (!isImageRenderingAvailable()) return null;
  const token = signCourtLetterToken(caseId);
  return `/api/public/court-letter/${caseId}/${token}.png`;
}

/**
 * Build the absolute, signed URL Twilio will fetch to attach the letter as MMS
 * media, or null when the letter must be sent as text only.
 *
 * Unlike the portal, this cannot be relative: a provider fetching over the
 * public internet has no way to reach http://localhost:5000, so both halves are
 * required.
 */
function buildCourtLetterMediaUrl(caseId) {
  if (!hasPublicBaseUrl()) {
    console.warn(`[COURT LETTER] Case #${caseId}: no public base URL, sending the letter as text only.`);
    return null;
  }

  const token = signCourtLetterToken(caseId);
  return buildPublicUrl(`/api/public/court-letter/${caseId}/${token}.png`);
}

/**
 * Notify the customer of the court letter by SMS, with the letter itself attached
 * as MMS media when the gateway can carry it.
 *
 * This is the step that actually creates the letter on the customer's page and
 * tells them it is there by SMS. It is hard-gated on the 7-day warning being
 * over, so a legal notice can never reach the customer earlier.
 * The merchant triggers it; the daily sweep never does, because a legal notice is
 * not something to send on a creditor's behalf without them asking.
 */
async function sendCourtLetter(caseId, options = {}) {
  const { trigger = 'MANUAL', actorUserId = null, actorName = 'System' } = options;

  const escalationCase = await loadEscalationCase(caseId);

  if (!escalationCase) {
    throw new Error('Escalation case not found.');
  }

  // A second notice on the same debt is both a duplicate legal notice and a second
  // billable SMS, so refuse rather than send. The merchant UI hides the button once
  // the letter has been sent.
  if (escalationCase.court_letter_sent_at && !options.allowResend) {
    throw new Error('The court letter has already been sent to this customer.');
  }

  // The wait is the whole point of the ladder: the customer gets a full week of
  // warnings before any court letter exists, and the letter must never be sent
  // earlier than that. Refuse early rather than shorten a warning the customer
  // was already given in writing.
  if (!options.allowResend) {
    const graceDays = escalationCase.warning_period_days || WARNING_PERIOD_DAYS;

    if (!escalationCase.warning_sent_at) {
      throw new Error(`An overdue warning must be sent before the court letter can be sent.`);
    }

    // Count from when the warning SMS went out: that is the start of the week.
    const elapsed = daysSince(escalationCase.warning_sent_at);
    if (elapsed < graceDays) {
      const remaining = graceDays - elapsed;
      throw new Error(
        `The court letter can be sent in ${remaining} day${remaining === 1 ? '' : 's'}. ` +
        `The customer must first receive the full ${graceDays} day warning.`
      );
    }
  }

  // The letter is created here, and only here: issuing it at warning time would
  // put a legal notice on the customer's page before their 7-day warning was
  // over. Idempotent for legacy rows that already carry a letter.
  const issued = await issueCourtLetter(caseId, escalationCase, { trigger });
  const letterRef = issued.letterRef;

  // Attach the letter image only when this process can actually render it. Sending
  // an MMS whose media URL would 404 costs money and tells the customer nothing.
  const mediaUrls = isImageRenderingAvailable()
    ? [buildCourtLetterMediaUrl(caseId)].filter(Boolean)
    : [];

  // Short notice only. The full letter, as text and as an image, is on the
  // customer's page.
  const smsMessage = getTemplate('COURT_LETTER', {
    customerName: escalationCase.customer_name,
    storeName: escalationCase.store_name,
    amount: parseFloat(escalationCase.amount).toFixed(2),
    letterRef,
    graceDays: escalationCase.warning_period_days || WARNING_PERIOD_DAYS
  });

  const smsResult = await sendSMS({
    customerId: escalationCase.customer_id,
    phone: escalationCase.customer_phone,
    message: smsMessage,
    type: 'COURT_LETTER',
    mediaUrls
  });

  // court_letter_sent_at is stamped only once a gateway actually accepted the
  // notice. Stamping it up front would burn the one shot the merchant has at this
  // notice: the duplicate guard would refuse the retry after a gateway outage,
  // and the customer would never learn about a letter sitting on their page.
  if (smsResult.success) {
    await db.run(
      `UPDATE escalation_cases
       SET escalation_type = 'COURT_LETTER',
           status = 'SENT',
           court_letter_sent_at = NOW(),
           updated_at = NOW(),
           notes = COALESCE(notes, 'Court letter sent to customer by merchant.')
       WHERE id = $1`,
      [caseId]
    );
  } else {
    console.error(`[COURT LETTER] Case #${caseId}: notice not delivered, the merchant can retry.`, smsResult.error);
  }

  logAudit({
    userId: actorUserId,
    actorName: actorName,
    action: 'COURT_LETTER_SENT',
    resource: `Escalation Case #${caseId}`,
    details: {
      customerId: escalationCase.customer_id,
      amount: escalationCase.amount,
      letterRef,
      gateway: smsResult.gateway,
      isMms: !!smsResult.isMms,
      delivered: !!smsResult.success,
      trigger
    }
  });

  return {
    escalationCase: {
      ...escalationCase,
      court_letter_ref: letterRef,
      court_letter_body: issued.courtLetterBody,
      court_letter_doc: issued.courtLetterDoc,
      court_letter_sent_at: smsResult.success ? new Date().toISOString() : null
    },
    courtLetterBody: issued.courtLetterBody,
    letterRef,
    delivered: !!smsResult.success,
    smsResult,
    trigger
  };
}

/**
 * Advance a single overdue Dube one step along the ladder.
 */
async function processOverdueTransaction(tx) {
  await db.run(
    `UPDATE credit_transactions SET status = 'OVERDUE'
     WHERE id = $1 AND status IN ('PENDING', 'PARTIALLY_PAID')`,
    [tx.id]
  );

  const escalation = await createEscalationCase(
    tx.customer_id, tx.merchant_id, tx.id, tx.total_amount, tx.due_date
  );

  const caseRow = escalation.case || await loadEscalationCase(escalation.caseId);
  const base = { transactionId: tx.id, transactionRef: tx.transaction_ref, caseId: escalation.caseId };

  // Never notify twice about the same debt.
  if (caseRow.court_letter_sent_at) {
    return { ...base, action: 'COURT_LETTER_ALREADY_SENT', letterRef: caseRow.court_letter_ref };
  }

  // First day overdue: warn by SMS only. No court letter exists yet — it is the
  // merchant's decision, made a full warning week later, to issue and send it.
  if (!caseRow.warning_sent_at) {
    await sendWarning(escalation.caseId, { trigger: 'AUTO' });
    return {
      ...base,
      action: 'WARNING_SENT',
      daysUntilCourtLetter: WARNING_PERIOD_DAYS
    };
  }

  const gracePeriod = caseRow.warning_period_days || WARNING_PERIOD_DAYS;
  const elapsed = daysSince(caseRow.warning_sent_at);

  if (elapsed >= gracePeriod) {
    // The 7-day warning is over. The merchant can now issue and send the court
    // letter from the dashboard, on their own customer.
    return {
      ...base,
      action: 'AWAITING_MERCHANT',
      daysSinceWarning: elapsed
    };
  }

  return { ...base, action: 'WAITING', daysRemaining: gracePeriod - elapsed };
}

/**
 * Sweep every overdue Dube: warn it by SMS on the first day, then leave it alone
 * for the 7-day warning. The court letter is created and sent only when the
 * merchant chooses to, a full warning week later. Safe to call repeatedly:
 * anything already warned, already settled, or whose warning is still running is
 * left alone.
 */
async function checkAndEscalateOverdue() {
  const today = toDateOnly(new Date());

  const overdueTransactions = await db.all(`
    SELECT ct.id, ct.transaction_ref, ct.customer_id, ct.merchant_id, ct.total_amount, ct.due_date, ct.status
    FROM credit_transactions ct
    WHERE ct.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
      AND ct.due_date < $1
    ORDER BY ct.due_date ASC
  `, [today]);

  const results = [];

  for (const tx of overdueTransactions) {
    try {
      results.push(await processOverdueTransaction(tx));
    } catch (err) {
      // One bad row must not abandon the rest of the sweep.
      console.error(`[ESCALATION] Transaction #${tx.id} failed:`, err.message);
      results.push({ transactionId: tx.id, action: 'ERROR', error: err.message });
    }
  }

  return results;
}

/**
 * Court letters issued against any of this customer's merchant ledgers.
 * CLOSED cases are withheld because the creditor withdrew the notice.
 */
async function getCustomerNotices(profileIds) {
  // Guard the array shape explicitly. A bare number would otherwise slip past the
  // length check and reach Postgres as a scalar, surfacing as "malformed array
  // literal" instead of the obvious empty result.
  if (!Array.isArray(profileIds) || profileIds.length === 0) return [];

  const rows = await db.all(`
    SELECT ec.id, ec.transaction_id, ec.merchant_id, ec.customer_id,
           ec.escalation_type, ec.status, ec.amount, ec.due_date, ec.notes,
           ec.warning_period_days, ec.warning_sent_at,
           ec.court_letter_ref, ec.court_letter_body, ec.court_letter_doc,
           ec.court_letter_issued_at, ec.court_letter_sent_at,
           ec.customer_acknowledged_at, ec.resolved_at, ec.created_at,
           m.store_name, m.address as store_address, m.business_license_no,
           ct.transaction_ref
    FROM escalation_cases ec
    JOIN customer_profiles cp ON ec.customer_id = cp.id
    JOIN merchants m ON ec.merchant_id = m.id
    LEFT JOIN credit_transactions ct ON ec.transaction_id = ct.id
    WHERE ec.customer_id = ANY($1::int[])
      AND ec.escalation_type = 'COURT_LETTER'
      AND ec.court_letter_issued_at IS NOT NULL
      AND ec.status <> 'CLOSED'
    ORDER BY ec.court_letter_issued_at DESC
  `, [profileIds]);

  // The portal is served by this same origin, so it uses the relative signed
  // path. Gating this on a public base URL would hide the letter entirely in
  // local development, even though the renderer and the route both work.
  const imagePath = buildCourtLetterImagePath;

  return rows.map((row) => ({
    ...row,
    amount: parseFloat(row.amount),
    due_date: toDateOnly(row.due_date),
    grace_days: row.warning_period_days || WARNING_PERIOD_DAYS,
    is_settled: row.status === 'RESOLVED',
    // Whether the customer has formally accepted the letter. Acceptance records
    // that the notice was seen; it does not settle the debt, so is_settled is
    // still false afterwards and the case stays active.
    is_acknowledged: !!row.customer_acknowledged_at,
    // The letter is created the day it is sent, so days since issue IS days
    // since the customer was first told the notice exists.
    days_since_issued: daysSince(row.court_letter_issued_at),
    // Whether the merchant has since notified them by SMS. The portal says so,
    // because a customer who has not had the text should not be left guessing
    // why a legal notice is sitting on their account.
    notified_by_sms: !!row.court_letter_sent_at,
    // Only offered when there is a document to render, so the UI never shows a
    // broken image. Built per row rather than once, because each case gets its
    // own token and building a missing URL logs a warning on every dashboard
    // load.
    image_available: !!row.court_letter_doc && isImageRenderingAvailable(),
    image_url: row.court_letter_doc ? imagePath(row.id) : null
  }));
}

/**
 * Close open escalation cases for transactions the customer has now settled, so
 * a court letter disappears from their page the moment the debt is actually
 * paid rather than waiting on the merchant to click resolve.
 */
async function resolveCasesForSettledTransactions(transactionIds) {
  const ids = (Array.isArray(transactionIds) ? transactionIds : [transactionIds]).filter(Boolean);
  if (ids.length === 0) return 0;

  const result = await db.run(`
    UPDATE escalation_cases
    SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW(),
        notes = COALESCE(notes, 'Debt settled automatically.')
    WHERE transaction_id = ANY($1::int[])
      AND status NOT IN ('RESOLVED', 'CLOSED')
  `, [ids]);

  if (result.rowCount > 0) {
    console.log(`[ESCALATION] Auto-resolved ${result.rowCount} escalation case(s) after settlement.`);
  }

  return result.rowCount;
}

// ============================================================
//  Daily sweep scheduler
// ============================================================
// Deliberately built on setInterval rather than a cron dependency: the server
// has no scheduler today, and adding a package for one daily job would put the
// whole deploy at risk for no benefit. The interval is hourly so a process that
// starts mid-day still gets its run, and a per-calendar-day guard keeps it to
// one real pass a day.
const SWEEP_INTERVAL_MINUTES = Math.max(
  1,
  parseInt(process.env.ESCALATION_SWEEP_INTERVAL_MINUTES || '60', 10) || 60
);
const SWEEP_ON_BOOT = (process.env.ESCALATION_SWEEP_ON_BOOT || 'true').toLowerCase() !== 'false';
const SWEEP_ENABLED = (process.env.ESCALATION_SWEEP_ENABLED || 'true').toLowerCase() !== 'false';

let sweepTimer = null;
let sweepRunning = false;
let lastSweepDate = null;
let warnedAboutMissingTable = false;

async function runSweep({ force = false } = {}) {
  if (sweepRunning) {
    return { skipped: true, reason: 'A sweep is already running.' };
  }

  const today = toDateOnly(new Date());
  if (!force && lastSweepDate === today) {
    return { skipped: true, reason: 'Already swept today.' };
  }

  sweepRunning = true;
  try {
    const results = await checkAndEscalateOverdue();
    lastSweepDate = today;

    const counts = results.reduce((acc, r) => {
      acc[r.action] = (acc[r.action] || 0) + 1;
      return acc;
    }, {});

    if (results.length > 0) {
      console.log(`[ESCALATION] Daily sweep complete:`, counts);
    } else {
      console.log('[ESCALATION] Daily sweep complete: no overdue debts.');
    }

    return { skipped: false, checked: results.length, counts, results };
  } catch (err) {
    // escalation_cases may be missing on a database that never ran the
    // migration. Warn once rather than filling the log every hour, and never
    // let a failed sweep take the server down.
    if (/escalation_cases/.test(err.message)) {
      if (!warnedAboutMissingTable) {
        console.error('[ESCALATION] Debt escalation disabled — escalation_cases table is missing.');
        console.error('[ESCALATION] Fix with: npm run migrate:escalations --prefix server');
        warnedAboutMissingTable = true;
      }
    } else {
      console.error('[ESCALATION] Daily sweep failed:', err.message);
    }
    return { skipped: false, error: err.message };
  } finally {
    sweepRunning = false;
  }
}

function startEscalationScheduler() {
  if (!SWEEP_ENABLED) {
    console.log('[ESCALATION] Daily debt sweep disabled by ESCALATION_SWEEP_ENABLED.');
    return null;
  }

  if (sweepTimer) {
    return sweepTimer;
  }

  const intervalMs = SWEEP_INTERVAL_MINUTES * 60 * 1000;
  sweepTimer = setInterval(() => {
    runSweep().catch((err) => console.error('[ESCALATION] Scheduler error:', err.message));
  }, intervalMs);

  // Never keep the process alive just for the sweep, and never let a sweep
  // rejection escape into an unhandled rejection.
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  if (SWEEP_ON_BOOT) {
    // Small delay so boot-time database checks and auto-seeding settle first.
    const bootTimer = setTimeout(() => {
      runSweep().catch((err) => console.error('[ESCALATION] Boot sweep error:', err.message));
    }, 15000);
    if (typeof bootTimer.unref === 'function') bootTimer.unref();
  }

  console.log(`[ESCALATION] Daily debt sweep armed (every ${SWEEP_INTERVAL_MINUTES} min, once per day, ${WARNING_PERIOD_DAYS} day warning period before the merchant can send a court letter).`);
  return sweepTimer;
}

function stopEscalationScheduler() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

async function getEscalationCases(merchantId) {
  const rows = await db.all(`
    SELECT ec.*, cp.full_name as customer_name, cp.phone as customer_phone, ct.transaction_ref
    FROM escalation_cases ec
    JOIN customer_profiles cp ON ec.customer_id = cp.id
    LEFT JOIN credit_transactions ct ON ec.transaction_id = ct.id
    WHERE ec.merchant_id = $1
    ORDER BY ec.created_at DESC
  `, [merchantId]);

  return rows.map((row) => {
    const gracePeriod = row.warning_period_days || WARNING_PERIOD_DAYS;
    const elapsed = daysSince(row.warning_sent_at);
    // Days left before the merchant may notify the customer of the court letter,
    // or null once they have. Zero means the button is now available. There is no
    // separate grace deadline: the 7-day warning after the letter reaches the
    // customer's page is the only gate.
    const daysUntilCourtLetter = row.court_letter_sent_at
      ? null
      : row.warning_sent_at
        ? Math.max(0, gracePeriod - elapsed)
        : gracePeriod;
    return {
      ...row,
      amount: parseFloat(row.amount),
      due_date: toDateOnly(row.due_date),
      grace_period_days: gracePeriod,
      days_since_warning: row.warning_sent_at ? elapsed : null,
      days_until_court_letter: daysUntilCourtLetter,
      // Two separate facts the dashboard shows separately: the letter is on the
      // customer's page, and the customer has been told about it by SMS.
      court_letter_issued: !!row.court_letter_issued_at,
      court_letter_notified: !!row.court_letter_sent_at,
      court_letter_can_be_sent: daysUntilCourtLetter === 0,
      // Whether the customer has formally accepted the letter without paying.
      // The debt remains, but the merchant now knows the notice was received.
      customer_acknowledged: !!row.customer_acknowledged_at
    };
  });
}

async function getEscalationCaseById(caseId, merchantId) {
  return await db.get(`
    SELECT ec.*, cp.full_name as customer_name, cp.phone as customer_phone, ct.transaction_ref
    FROM escalation_cases ec
    JOIN customer_profiles cp ON ec.customer_id = cp.id
    LEFT JOIN credit_transactions ct ON ec.transaction_id = ct.id
    WHERE ec.id = $1 AND ec.merchant_id = $2
  `, [caseId, merchantId]);
}

/**
 * Record the customer's formal acceptance of the court letter.
 *
 * Accepting is not paying: the customer says they have seen the notice while
 * the debt stays outstanding, so the case must remain active. The acceptance is
 * deliberately one-way and idempotent — a customer can acknowledge as many times
 * as they like, only the first timestamp is kept, and the act is never undone,
 * because a legal notice cannot be un-accepted once on record.
 */
async function acknowledgeCourtLetter(caseId, customerProfileIds) {
  const ids = (Array.isArray(customerProfileIds) ? customerProfileIds : [customerProfileIds]).filter(Boolean);
  if (ids.length === 0) {
    throw new Error('Customer profile is required.');
  }

  const escalationCase = await db.get(
    `SELECT ec.*, cp.full_name as customer_name, m.store_name
     FROM escalation_cases ec
     JOIN customer_profiles cp ON ec.customer_id = cp.id
     JOIN merchants m ON ec.merchant_id = m.id
     WHERE ec.id = $1`,
    [caseId]
  );

  if (!escalationCase) {
    throw new Error('Court letter case not found.');
  }

  if (!ids.includes(escalationCase.customer_id)) {
    throw new Error('This court letter does not belong to your account.');
  }

  if (escalationCase.escalation_type !== 'COURT_LETTER' || !escalationCase.court_letter_issued_at) {
    throw new Error('No court letter has been issued for this case.');
  }

  if (['RESOLVED', 'CLOSED'].includes(escalationCase.status)) {
    throw new Error('This case is already settled or closed.');
  }

  const result = await db.run(
    `UPDATE escalation_cases
     SET status = 'RESPONDED',
         customer_acknowledged_at = COALESCE(customer_acknowledged_at, NOW()),
         updated_at = NOW(),
         notes = CASE
           WHEN COALESCE(notes, '') <> '' THEN notes || ' — '
           ELSE ''
         END || 'Customer acknowledged receipt of the court letter.'
     WHERE id = $1
       AND customer_id = ANY($2::int[])`,
    [caseId, ids]
  );

  if (result.rowCount === 0) {
    throw new Error('Could not acknowledge the court letter.');
  }

  logAudit({
    userId: null,
    actorName: escalationCase.customer_name,
    action: 'COURT_LETTER_ACKNOWLEDGED',
    resource: `Escalation Case #${caseId}`,
    details: {
      merchantId: escalationCase.merchant_id,
      storeName: escalationCase.store_name,
      amount: escalationCase.amount,
      letterRef: escalationCase.court_letter_ref
    }
  });

  return {
    message: 'Court letter accepted. The debt remains outstanding.',
    caseId,
    letterRef: escalationCase.court_letter_ref,
    acknowledged_at: new Date().toISOString()
  };
}

async function resolveEscalationCase(caseId, merchantId, notes) {
  const result = await db.run(
    `UPDATE escalation_cases SET status = 'RESOLVED', resolved_at = NOW(), notes = $1, updated_at = NOW()
     WHERE id = $2 AND merchant_id = $3`,
    [notes || 'Debt settled', caseId, merchantId]
  );

  if (result.rowCount === 0) {
    throw new Error('Escalation case not found or access denied.');
  }

  return { message: 'Escalation case resolved successfully.' };
}

async function closeEscalationCase(caseId, merchantId, notes) {
  const result = await db.run(
    `UPDATE escalation_cases SET status = 'CLOSED', notes = $1, updated_at = NOW()
     WHERE id = $2 AND merchant_id = $3`,
    [notes || 'Case closed', caseId, merchantId]
  );

  if (result.rowCount === 0) {
    throw new Error('Escalation case not found or access denied.');
  }

  return { message: 'Escalation case closed successfully.' };
}

module.exports = {
  createEscalationCase,
  sendWarning,
  issueCourtLetter,
  sendCourtLetter,
  checkAndEscalateOverdue,
  getCustomerNotices,
  resolveCasesForSettledTransactions,
  startEscalationScheduler,
  stopEscalationScheduler,
  runSweep,
  buildCourtLetterBody,
  buildCourtLetterDocument,
  getEscalationCases,
  getEscalationCaseById,
  acknowledgeCourtLetter,
  resolveEscalationCase,
  closeEscalationCase,
  WARNING_PERIOD_DAYS
};
