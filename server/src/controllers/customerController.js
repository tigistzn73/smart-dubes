const db = require('../config/database');
const { processRepayment, processMultiMerchantRepayment } = require('../services/paymentGatewayService');

// pg hands back DATE columns as a Date at local midnight, so calling toISOString()
// would roll the calendar day back for users east of UTC. Read the local parts instead.
function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).split('T')[0];
}

// Same concern, but returns a local-midnight Date ready for calendar math
function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const parts = String(value).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Get Customer Balance and Dube Ledger Accounts
async function getCustomerDashboard(req, res) {
  try {
    const userPhone = req.user.phone;
    
    // Find all customer credit profiles linked to this phone across different merchant ledgers
    const profiles = await db.all(`
      SELECT cp.*, m.store_name, m.address as store_address, m.business_license_no
      FROM customer_profiles cp
      JOIN merchants m ON cp.merchant_id = m.id
      WHERE cp.phone = $1 OR cp.user_id = $2
    `, [userPhone, req.user.id]);

    if (profiles.length === 0) {
      return res.json({
        totalBalance: 0.00,
        totalCreditLimit: 0.00,
        availableCredit: 0.00,
        profiles: [],
        pendingTransactions: [],
        repayments: []
      });
    }

    const profileIds = profiles.map(p => p.id);

    // Pending Credit Ledger Items across all merchants
    const pendingTransactions = await db.all(`
      SELECT ct.*, cp.full_name as customer_name, m.store_name
      FROM credit_transactions ct
      JOIN customer_profiles cp ON ct.customer_id = cp.id
      JOIN merchants m ON ct.merchant_id = m.id
      WHERE ct.customer_id = ANY($1::int[])
      ORDER BY ct.created_at DESC
    `, [profileIds]);

    // Calculate sum of completed repayments for each transaction to ensure status accuracy
    const formattedTx = await Promise.all(pendingTransactions.map(async t => {
      const sumRes = await db.get(`SELECT SUM(amount) as total FROM repayments WHERE transaction_id = $1 AND status = 'COMPLETED'`, [t.id]);
      const paidSum = parseFloat(sumRes?.total || 0);
      const remaining = Math.max(0, parseFloat(t.total_amount) - paidSum);
      const isSettled = remaining === 0 || t.status === 'SETTLED';
      if (isSettled && t.status !== 'SETTLED') {
        await db.run(`UPDATE credit_transactions SET status = 'SETTLED' WHERE id = $1`, [t.id]);
      }
      return {
        ...t,
        status: isSettled ? 'SETTLED' : t.status,
        remaining_amount: remaining,
        due_date: toDateOnly(t.due_date),
        items: JSON.parse(t.items_json || '[]')
      };
    }));

    // Repayments history
    const repayments = await db.all(`
      SELECT r.*, m.store_name
      FROM repayments r
      JOIN merchants m ON r.merchant_id = m.id
      WHERE r.customer_id = ANY($1::int[])
      ORDER BY r.created_at DESC
    `, [profileIds]);

    // Notifications / Alerts history
    const notifications = await db.all(`
      SELECT *
      FROM sms_notifications
      WHERE phone = $1 OR customer_id = ANY($2::int[])
      ORDER BY sent_at DESC
    `, [userPhone, profileIds]);

    const totalBalance = profiles.reduce((sum, p) => sum + parseFloat(p.current_balance), 0);
    const totalCreditLimit = profiles.reduce((sum, p) => sum + parseFloat(p.credit_limit), 0);

    // Active Salary Schedules for customer (per-merchant and combined)
    const scheduleRows = await db.all(`
      SELECT cs.*, m.store_name, m.id as merchant_id
      FROM customer_schedules cs
      LEFT JOIN customer_profiles cp ON cs.customer_id = cp.id
      LEFT JOIN merchants m ON cp.merchant_id = m.id
      WHERE cs.user_id = $1 AND cs.status = 'ACTIVE'
      ORDER BY cs.id DESC
    `, [req.user.id]);

    const activeSchedules = [];
    for (const sRow of scheduleRows) {
      const insts = JSON.parse(sRow.installments_json || '[]');
      const allPaid = insts.length > 0 && insts.every(i => i.status === 'PAID');

      if (allPaid) {
        await db.run(`UPDATE customer_schedules SET status = 'COMPLETED' WHERE id = $1`, [sRow.id]);
      } else {
        activeSchedules.push({
          ...sRow,
          installments: insts
        });
      }
    }
    const activeSchedule = activeSchedules.length > 0 ? activeSchedules[0] : null;

    res.json({
      summary: {
        totalBalance,
        totalCreditLimit,
        availableCredit: Math.max(0, totalCreditLimit - totalBalance),
        activeAccountsCount: profiles.length
      },
      profiles,
      transactions: formattedTx,
      repayments,
      notifications,
      activeSchedule,
      activeSchedules
    });
  } catch (err) {
    console.error('Customer Dashboard Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Initiate Digital Settlement with Telebirr, Chapa, CBE Birr
async function initiateRepayment(req, res) {
  const { transactionId, customerId, amount, paymentGateway, referenceCode, receiptUrl, installmentNo, isMultiMerchant } = req.body;

  try {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ error: 'Valid repayment amount is required.' });
    }

    if (isMultiMerchant || (!transactionId && !customerId)) {
      const multiResult = await processMultiMerchantRepayment({
        userId: req.user.id,
        userPhone: req.user.phone,
        amount: payAmount,
        gateway: paymentGateway || 'TELEBIRR',
        referenceCode,
        receiptUrl,
        actorName: req.user.fullName,
        installmentNo
      });

      return res.json({
        message: `Multi-merchant repayment of ${payAmount.toFixed(2)} ETB via ${paymentGateway} successfully processed across ${multiResult.allocations.length} merchants.`,
        receipt: multiResult
      });
    }

    const result = await processRepayment({
      transactionId,
      customerId,
      amount: payAmount,
      gateway: paymentGateway || 'TELEBIRR',
      referenceCode,
      receiptUrl,
      userId: req.user.id,
      actorName: req.user.fullName
    });

    // If an installment repayment was specified, update installment status in active schedule
    if (installmentNo) {
      const scheduleRow = await db.get(`SELECT * FROM customer_schedules WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`, [req.user.id]);
      if (scheduleRow) {
        let installments = JSON.parse(scheduleRow.installments_json || '[]');
        installments = installments.map(inst => {
          if (inst.installmentNo === parseInt(installmentNo)) {
            return { ...inst, status: 'PAID' };
          }
          return inst;
        });
        await db.run(`UPDATE customer_schedules SET installments_json = $1 WHERE id = $2`, [JSON.stringify(installments), scheduleRow.id]);
      }
    }

    res.json({
      message: `Repayment of ${payAmount.toFixed(2)} ETB via ${paymentGateway} successfully processed.`,
      receipt: result
    });
  } catch (err) {
    console.error('Repayment Error:', err);
    res.status(400).json({ error: err.message });
  }
}

// Flexible Repayment Installment Builder Calculator:
// Supports WEEKLY and MONTHLY frequencies.
// Honors requested numInstallments, respects repayment deadline, and ensures all dates are >= today.
async function calculateFlexibleInstallments(userId, totalAmount, frequency, _unused, numInstallments, merchantId, reqDeadlineDate, txId) {
  const amount = parseFloat(totalAmount);
  let numInst = parseInt(numInstallments || 2);
  if (numInst < 1) numInst = 1;

  // Today's date at local midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cp = null;
  let deadlineDate = null;

  // 1. If txId is provided, fetch directly from credit_transactions
  if (txId) {
    const tx = await db.get(`SELECT * FROM credit_transactions WHERE id = $1`, [txId]);
    if (tx) {
      if (tx.due_date) {
        deadlineDate = parseDateOnly(tx.due_date);
      }
      if (tx.customer_id) {
        cp = await db.get(`SELECT id FROM customer_profiles WHERE id = $1`, [tx.customer_id]);
      }
    }
  }

  // 2. If reqDeadlineDate is explicitly provided
  if ((!deadlineDate || isNaN(deadlineDate.getTime())) && reqDeadlineDate) {
    deadlineDate = parseDateOnly(reqDeadlineDate);
  }

  // 3. Find customer profile if not yet found
  if (!cp && merchantId) {
    cp = await db.get(`SELECT id FROM customer_profiles WHERE (user_id = $1 OR phone = (SELECT phone FROM users WHERE id = $1)) AND merchant_id = $2 LIMIT 1`, [userId, merchantId]);
  }
  if (!cp) {
    cp = await db.get(`
      SELECT cp.id FROM customer_profiles cp
      JOIN credit_transactions ct ON ct.customer_id = cp.id
      WHERE (cp.user_id = $1 OR cp.phone = (SELECT phone FROM users WHERE id = $1)) AND ct.status IN ('PENDING', 'PARTIALLY_PAID')
      ORDER BY cp.current_balance DESC LIMIT 1
    `, [userId]);
  }
  if (!cp) {
    cp = await db.get(`SELECT id FROM customer_profiles WHERE user_id = $1 OR phone = (SELECT phone FROM users WHERE id = $1) LIMIT 1`, [userId]);
  }

  // 4. If deadlineDate still not found, search transactions
  if ((!deadlineDate || isNaN(deadlineDate.getTime())) && cp) {
    const tx = await db.get(`
      SELECT due_date FROM credit_transactions
      WHERE customer_id = $1 AND status IN ('PENDING', 'PARTIALLY_PAID') AND due_date IS NOT NULL
      ORDER BY (CASE WHEN ABS(total_amount - $2) < 0.01 THEN 0 ELSE 1 END), due_date DESC LIMIT 1
    `, [cp.id, amount]);
    if (tx && tx.due_date) {
      deadlineDate = parseDateOnly(tx.due_date);
    }
  }

  // Fallback: if no deadline found, default to 14 days from today
  if (!deadlineDate || isNaN(deadlineDate.getTime())) {
    deadlineDate = new Date(today);
    deadlineDate.setDate(deadlineDate.getDate() + 14);
  }
  deadlineDate.setHours(0, 0, 0, 0);

  // If deadline is in the past, move it forward
  if (deadlineDate < today) {
    deadlineDate = new Date(today);
    deadlineDate.setDate(deadlineDate.getDate() + 7);
  }

  // Generate valid installment dates based on frequency, numInst, and deadlineDate
  let installmentDates = [];

  if (frequency === 'WEEKLY') {
    // Try counting backward from deadlineDate (step = 7 days)
    const backwardDates = [];
    for (let i = numInst - 1; i >= 0; i--) {
      const d = new Date(deadlineDate);
      d.setDate(deadlineDate.getDate() - i * 7);
      backwardDates.push(d);
    }

    // If the earliest backward date is >= today, all installments fit cleanly up to the deadline
    if (backwardDates[0] >= today) {
      installmentDates = backwardDates;
    } else {
      // If going backward lands before today (e.g. numInst is too large for remaining days),
      // space them between today and deadline if possible, or forward weekly
      const diffDays = Math.round((deadlineDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays >= numInst) {
        const interval = diffDays / numInst;
        for (let i = 1; i <= numInst; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + Math.round(i * interval));
          installmentDates.push(d);
        }
      } else {
        for (let i = 1; i <= numInst; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i * 7);
          installmentDates.push(d);
        }
      }
    }
  } else {
    // MONTHLY frequency
    const backwardDates = [];
    const dlDay = deadlineDate.getDate();
    const dlMonth = deadlineDate.getMonth();
    const dlYear = deadlineDate.getFullYear();

    for (let i = numInst - 1; i >= 0; i--) {
      const targetMonth = dlMonth - i;
      const targetYear = dlYear + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const lastDayOfMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
      const targetDay = Math.min(dlDay, lastDayOfMonth);
      backwardDates.push(new Date(targetYear, normalizedMonth, targetDay));
    }

    if (backwardDates[0] >= today) {
      installmentDates = backwardDates;
    } else {
      // Going backward lands in past; schedule forward from deadlineDate
      installmentDates = [];
      const baseDate = deadlineDate > today ? new Date(deadlineDate) : new Date(today);
      for (let i = 0; i < numInst; i++) {
        const targetMonth = baseDate.getMonth() + i;
        const targetYear = baseDate.getFullYear() + Math.floor(targetMonth / 12);
        const normalizedMonth = ((targetMonth % 12) + 12) % 12;
        const lastDayOfMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
        const targetDay = Math.min(baseDate.getDate(), lastDayOfMonth);
        installmentDates.push(new Date(targetYear, normalizedMonth, targetDay));
      }
    }
  }

  // Ensure dates are sorted chronologically
  installmentDates.sort((a, b) => a - b);

  // Build installments array with exact penny-perfect total
  const perInstallment = Math.floor((amount / installmentDates.length) * 100) / 100;
  let remainingAmount = amount;
  const installments = [];

  for (let i = 0; i < installmentDates.length; i++) {
    const dueDate = installmentDates[i];
    const y = dueDate.getFullYear();
    const m = String(dueDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(dueDate.getDate()).padStart(2, '0');

    const isLast = (i === installmentDates.length - 1);
    const instAmount = isLast ? parseFloat(remainingAmount.toFixed(2)) : perInstallment;
    remainingAmount = parseFloat((remainingAmount - instAmount).toFixed(2));

    installments.push({
      installmentNo: i + 1,
      dueDate: `${y}-${m}-${dayStr}`,
      amount: instAmount,
      status: 'SCHEDULED'
    });
  }

  const finalDueDate = installments.length > 0 ? installments[installments.length - 1].dueDate : null;
  const deadlineDateStr = finalDueDate || `${deadlineDate.getFullYear()}-${String(deadlineDate.getMonth() + 1).padStart(2, '0')}-${String(deadlineDate.getDate()).padStart(2, '0')}`;

  return {
    amount,
    deadlineDateStr,
    installments,
    cpId: cp ? cp.id : null
  };
}

// Accept either a single txId or a txIds array and return a de-duplicated list of ids
function normalizeTxIds({ txIds, txId }) {
  const raw = Array.isArray(txIds) ? txIds : (txId !== undefined && txId !== null ? [txId] : []);
  const ids = raw.map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v) && v > 0);
  return [...new Set(ids)];
}

// Load the requested Dube receipts, scoped to the authenticated customer so a
// receipt belonging to someone else is never scheduled. Preserves the requested order.
async function loadOwnedPendingTransactions(req, ids) {
  const profiles = await db.all(
    `SELECT id FROM customer_profiles WHERE phone = $1 OR user_id = $2`,
    [req.user.phone, req.user.id]
  );
  if (profiles.length === 0) return [];

  const rows = await db.all(
    `SELECT id, customer_id, total_amount, due_date
     FROM credit_transactions
     WHERE id = ANY($1::int[]) AND customer_id = ANY($2::int[])`,
    [ids, profiles.map(p => p.id)]
  );

  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function deriveSalaryDay(installments, firstPaymentDate) {
  if (firstPaymentDate) {
    const parts = String(firstPaymentDate).split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      if (!Number.isNaN(day) && day >= 1 && day <= 31) return day;
    }
  }
  const first = installments && installments[0];
  if (first && first.dueDate) {
    const day = parseInt(String(first.dueDate).split('-')[2], 10);
    if (!Number.isNaN(day) && day >= 1 && day <= 31) return day;
  }
  return 30;
}

// Create one independent schedule for a single Dube receipt, anchored to that
// receipt's own due date. Only supersedes schedules linked to the same receipt,
// so scheduling several receipts in a row never wipes the previous ones.
async function applyScheduleForTransaction({ userId, tx, frequency, numInst, firstPaymentDate }) {
  const { amount, deadlineDateStr, installments } = await calculateFlexibleInstallments(
    userId,
    parseFloat(tx.total_amount),
    frequency,
    firstPaymentDate,
    numInst,
    null,
    null,
    tx.id
  );

  await db.run(
    `UPDATE customer_schedules SET status = 'SUPERSEDED'
     WHERE user_id = $1 AND transaction_id = $2 AND status = 'ACTIVE'`,
    [userId, tx.id]
  );

  const inserted = await db.get(
    `INSERT INTO customer_schedules (customer_id, user_id, total_amount, frequency, salary_day, duration_months, installments_json, status, transaction_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
     RETURNING *`,
    [
      tx.customer_id,
      userId,
      amount,
      frequency,
      deriveSalaryDay(installments, firstPaymentDate),
      numInst,
      JSON.stringify(installments),
      tx.id
    ]
  );

  await db.run(`UPDATE credit_transactions SET due_date = $1 WHERE id = $2`, [
    installments[installments.length - 1].dueDate,
    tx.id
  ]);

  return {
    ...inserted,
    transaction_id: tx.id,
    deadlineDate: deadlineDateStr,
    installments
  };
}

// Generate Customized Repayment Installment Schedule (Preview)
async function generateInstallmentSchedule(req, res) {
  const { totalAmount, frequency, firstPaymentDate, numInstallments, merchantId, deadlineDate: reqDeadlineDate, txId, txIds } = req.body;
  const selectedIds = normalizeTxIds({ txIds, txId });

  try {
    const numInst = parseInt(numInstallments || 2);

    // More than one receipt: preview one independent plan per receipt
    if (selectedIds.length > 1) {
      const ownedTxs = await loadOwnedPendingTransactions(req, selectedIds);
      if (ownedTxs.length !== selectedIds.length) {
        return res.status(400).json({ error: 'One or more selected Dube receipts are unavailable.' });
      }

      const schedules = [];
      for (const tx of ownedTxs) {
        const preview = await calculateFlexibleInstallments(
          req.user.id,
          parseFloat(tx.total_amount),
          frequency,
          firstPaymentDate,
          numInst,
          null,
          null,
          tx.id
        );
        schedules.push({
          transactionId: tx.id,
          totalAmount: preview.amount,
          deadlineDate: preview.deadlineDateStr,
          installments: preview.installments
        });
      }

      return res.json({
        frequency,
        numInstallments: numInst,
        count: schedules.length,
        totalAmount: schedules.reduce((sum, s) => sum + s.totalAmount, 0),
        schedules
      });
    }

    const { amount, deadlineDateStr, installments } = await calculateFlexibleInstallments(
      req.user.id,
      totalAmount,
      frequency,
      firstPaymentDate,
      numInstallments,
      merchantId,
      reqDeadlineDate,
      selectedIds[0]
    );

    res.json({
      totalAmount: amount,
      frequency,
      deadlineDate: deadlineDateStr,
      transactionId: selectedIds[0] || null,
      installments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Save & Apply Active Salary Repayment Schedule
async function saveCustomerSchedule(req, res) {
  const { totalAmount, frequency, firstPaymentDate, numInstallments, merchantId, deadlineDate: reqDeadlineDate, txId, txIds } = req.body;
  const selectedIds = normalizeTxIds({ txIds, txId });

  try {
    const numInst = parseInt(numInstallments || 2);

    // More than one receipt: one independent plan per receipt, each anchored to
    // that receipt's own due date
    if (selectedIds.length > 1) {
      const ownedTxs = await loadOwnedPendingTransactions(req, selectedIds);
      if (ownedTxs.length !== selectedIds.length) {
        return res.status(400).json({ error: 'One or more selected Dube receipts are unavailable.' });
      }

      const schedules = [];
      for (const tx of ownedTxs) {
        schedules.push(await applyScheduleForTransaction({
          userId: req.user.id,
          tx,
          frequency,
          numInst,
          firstPaymentDate
        }));
      }

      return res.status(201).json({
        message: `Repayment schedule applied to ${schedules.length} Dube receipts.`,
        schedules
      });
    }

    const { amount, deadlineDateStr, installments, cpId } = await calculateFlexibleInstallments(
      req.user.id,
      totalAmount,
      frequency,
      firstPaymentDate,
      numInstallments,
      merchantId,
      reqDeadlineDate,
      selectedIds[0]
    );

    // Deactivate the previous active schedule. Transaction-scoped schedules only
    // supersede other schedules for that same receipt, and a store-level (aggregate)
    // schedule only supersedes other aggregate schedules — so per-receipt plans the
    // customer already created are never silently discarded.
    if (selectedIds[0]) {
      await db.run(
        `UPDATE customer_schedules SET status = 'SUPERSEDED' WHERE user_id = $1 AND transaction_id = $2 AND status = 'ACTIVE'`,
        [req.user.id, selectedIds[0]]
      );
    } else if (cpId) {
      await db.run(
        `UPDATE customer_schedules SET status = 'SUPERSEDED'
         WHERE user_id = $1 AND customer_id = $2 AND transaction_id IS NULL AND status = 'ACTIVE'`,
        [req.user.id, cpId]
      );
    } else {
      await db.run(
        `UPDATE customer_schedules SET status = 'SUPERSEDED'
         WHERE user_id = $1 AND (customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customer_profiles WHERE user_id = $1)) AND status = 'ACTIVE'`,
        [req.user.id]
      );
    }

    const result = await db.get(`
      INSERT INTO customer_schedules (customer_id, user_id, total_amount, frequency, salary_day, duration_months, installments_json, status, transaction_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
      RETURNING *
    `, [
      cpId,
      req.user.id,
      amount,
      frequency,
      deriveSalaryDay(installments, firstPaymentDate),
      numInst,
      JSON.stringify(installments),
      selectedIds[0] || null
    ]);

    // Update credit transactions' due_dates to align with the active schedule installment due dates
    if (selectedIds[0] && installments.length > 0) {
      const finalDueDate = installments[installments.length - 1].dueDate;
      await db.run(`UPDATE credit_transactions SET due_date = $1 WHERE id = $2`, [finalDueDate, selectedIds[0]]);
    } else if (cpId && installments.length > 0) {
      // Skip receipts that already have their own active plan, otherwise this
      // aggregate schedule would overwrite the deadlines those plans just set.
      const pendingTxs = await db.all(`
        SELECT ct.id FROM credit_transactions ct
        WHERE ct.customer_id = $1
          AND ct.status IN ('PENDING', 'PARTIALLY_PAID')
          AND NOT EXISTS (
            SELECT 1 FROM customer_schedules cs
            WHERE cs.transaction_id = ct.id AND cs.status = 'ACTIVE'
          )
        ORDER BY ct.created_at ASC
      `, [cpId]);

      for (let idx = 0; idx < pendingTxs.length; idx++) {
        const inst = installments[Math.min(idx, installments.length - 1)];
        await db.run(`UPDATE credit_transactions SET due_date = $1 WHERE id = $2`, [inst.dueDate, pendingTxs[idx].id]);
      }
    }

    res.status(201).json({
      message: 'Flexible Repayment Schedule applied successfully! Repayment deadline updated.',
      schedule: {
        ...result,
        installments
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getCustomerDashboard,
  initiateRepayment,
  generateInstallmentSchedule,
  saveCustomerSchedule
};
