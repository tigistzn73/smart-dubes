const db = require('../config/database');
const { evaluateCreditRisk } = require('../services/riskEngine');
const { sendSMS, getTemplate } = require('../services/smsService');
const { logAudit } = require('../services/auditService');
const { approveUploadedReceipt } = require('../services/paymentGatewayService');
const {
  getEscalationCases: fetchEscalationCases,
  getEscalationCaseById,
  sendWarning,
  sendCourtLetter,
  resolveEscalationCase: resolveCase,
  closeEscalationCase: closeCase
} = require('../services/escalationService');

// Get merchant profile for current user
async function getMerchantProfile(req, res) {
  try {
    const merchant = await db.get('SELECT * FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant profile not found for user.' });
    }
    res.json({ merchant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get all customer profiles for a merchant
async function getMerchantCustomers(req, res) {
  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const customers = await db.all(`
      SELECT c.*, 
        (c.credit_limit - c.current_balance) as available_credit,
        (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.customer_id = c.id AND ct.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')) as pending_transactions_count,
        (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.customer_id = c.id AND ct.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE') AND ct.due_date < CURRENT_DATE) as overdue_count
      FROM customer_profiles c
      WHERE c.merchant_id = $1
      ORDER BY c.created_at DESC
    `, [merchant.id]);

    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Register a new customer credit profile
async function registerCustomerProfile(req, res) {
  const { fullName, phone, faydaId, photoUrl, creditLimit } = req.body;

  try {
    const merchant = await db.get('SELECT id, store_name FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(400).json({ error: 'Only registered merchants can create customer credit profiles.' });
    }

    // Check if phone already registered for this merchant
    const existing = await db.get('SELECT id FROM customer_profiles WHERE merchant_id = $1 AND phone = $2', [merchant.id, phone]);
    if (existing) {
      return res.status(400).json({ error: 'A customer profile with this phone number already exists in your ledger.' });
    }

    // Check if customer has a registered user account in the system to link
    const linkedUser = await db.get('SELECT id, photo_url FROM users WHERE phone = $1', [phone]);

    const limit = creditLimit ? parseFloat(creditLimit) : 5000.00;
    
    let defaultPhoto = photoUrl;
    if (!defaultPhoto && linkedUser && linkedUser.photo_url) {
      defaultPhoto = linkedUser.photo_url;
    }
    if (!defaultPhoto || !defaultPhoto.trim()) {
      defaultPhoto = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`;
    }
      
    const result = await db.get(`
      INSERT INTO customer_profiles (merchant_id, user_id, full_name, phone, fayda_id, photo_url, credit_limit, current_balance, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0.00, 'ACTIVE') RETURNING id
    `, [merchant.id, linkedUser ? linkedUser.id : null, fullName, phone, faydaId, defaultPhoto, limit]);
    const customerId = result.id;

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'CUSTOMER_PROFILE_CREATED',
      resource: `Customer #${customerId}`,
      details: { fullName, phone, faydaId, creditLimit: limit, storeName: merchant.store_name }
    });

    // Send welcome SMS
    sendSMS({
      customerId,
      phone,
      message: `[Smart Dube] Welcome ${fullName}! You have been registered for Dube credit at ${merchant.store_name} with a max limit of ${limit.toFixed(2)} ETB.`,
      type: 'CREDIT_ISSUED'
    });

    res.status(201).json({
      message: 'Customer Dube credit profile created successfully.',
      customer: {
        id: customerId,
        merchantId: merchant.id,
        fullName,
        phone,
        faydaId,
        creditLimit: limit,
        currentBalance: 0.00,
        status: 'ACTIVE'
      }
    });
  } catch (err) {
    console.error('Register Customer Profile Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Update Customer Credit Limit or Block Status
async function updateCustomerProfile(req, res) {
  const { customerId } = req.params;
  const { creditLimit, status } = req.body;

  try {
    const merchant = await db.get('SELECT id, store_name FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(400).json({ error: 'Only registered merchants can update customer credit profiles.' });
    }
    const customer = await db.get('SELECT * FROM customer_profiles WHERE id = $1 AND merchant_id = $2', [customerId, merchant.id]);

    if (!customer) {
      return res.status(404).json({ error: 'Customer credit profile not found.' });
    }

    // Test for presence, not truthiness, so lowering a limit to exactly 0 works
    const hasLimit = creditLimit !== undefined && creditLimit !== null && creditLimit !== '';
    const updatedLimit = hasLimit ? parseFloat(creditLimit) : customer.credit_limit;
    const updatedStatus = status || customer.status;

    if (hasLimit && (Number.isNaN(updatedLimit) || updatedLimit < 0)) {
      return res.status(400).json({ error: 'Credit limit must be a number of 0 or more.' });
    }

    const balance = parseFloat(customer.current_balance);
    if (updatedLimit < balance) {
      return res.status(400).json({
        error: `Credit limit cannot be below the outstanding balance of ${balance.toFixed(2)} ETB.`,
        currentBalance: balance,
        creditLimit: updatedLimit
      });
    }

    await db.run('UPDATE customer_profiles SET credit_limit = $1, status = $2 WHERE id = $3', [updatedLimit, updatedStatus, customerId]);

    const limitChanged = String(parseFloat(updatedLimit)) !== String(parseFloat(customer.credit_limit));
    const statusChanged = updatedStatus !== customer.status;

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'CUSTOMER_PROFILE_UPDATED',
      resource: `Customer #${customerId}`,
      details: { previousLimit: customer.credit_limit, newLimit: updatedLimit, previousStatus: customer.status, newStatus: updatedStatus }
    });

    // Only nudge the customer when something they can see actually changed
    if (statusChanged || limitChanged) {
      const msg = statusChanged && updatedStatus === 'BLOCKED'
        ? `[Smart Dube] Your Dube credit at ${merchant.store_name} has been blocked. Please contact the store.`
        : limitChanged
          ? `[Smart Dube] Your Dube credit limit at ${merchant.store_name} is now ${parseFloat(updatedLimit).toFixed(2)} ETB.`
          : null;
      if (msg) {
        sendSMS({ customerId, phone: customer.phone, message: msg, type: 'CREDIT_ISSUED' });
      }
    }

    res.json({
      message: 'Customer credit profile updated successfully.',
      customer: {
        id: customer.id,
        creditLimit: parseFloat(updatedLimit),
        currentBalance: balance,
        status: updatedStatus
      }
    });
  } catch (err) {
    console.error('Update Customer Profile Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Save the merchant's settlement (bank) account, so a customer paying by bank
// transfer can see exactly where to send the money before uploading the receipt.
async function updateMerchantBankAccount(req, res) {
  const { bankName, accountName, accountNumber } = req.body;

  try {
    const merchant = await db.get('SELECT * FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(400).json({ error: 'Only registered merchants can set a bank account.' });
    }

    // Clearing a field is allowed (send an empty string), so a merchant can remove
    // details they no longer want shown. Trim so a stray space never becomes part
    // of an account number the customer has to retype.
    const bank = (bankName || '').trim() || null;
    const name = (accountName || '').trim() || null;
    const number = (accountNumber || '').trim() || null;

    // A half-filled account is worse than none: the customer would transfer to an
    // incomplete destination. Require all three together, or none at all.
    const filled = [bank, name, number].filter(Boolean).length;
    if (filled !== 0 && filled !== 3) {
      return res.status(400).json({ error: 'Provide the bank name, account name and account number together, or leave all three empty.' });
    }

    await db.run(
      'UPDATE merchants SET bank_name = $1, account_name = $2, account_number = $3 WHERE id = $4',
      [bank, name, number, merchant.id]
    );

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'MERCHANT_BANK_ACCOUNT_UPDATED',
      resource: `Merchant #${merchant.id}`,
      details: { storeName: merchant.store_name, bankName: bank, accountName: name, accountNumber: number }
    });

    res.json({
      message: filled === 0
        ? 'Bank account details removed.'
        : 'Bank account details saved. Customers can now see them when paying by bank transfer.',
      bankAccount: { bank_name: bank, account_name: name, account_number: number }
    });
  } catch (err) {
    console.error('Update Merchant Bank Account Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Log new Credit Transaction with itemized breakdown and Risk Assessment Enforcer
async function createCreditTransaction(req, res) {
  const { customerId, items, totalAmount, dueDate, notes } = req.body;

  try {
    const merchant = await db.get('SELECT id, store_name FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(400).json({ error: 'Merchant profile required.' });
    }

    const customer = await db.get('SELECT * FROM customer_profiles WHERE id = $1 AND merchant_id = $2', [customerId, merchant.id]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer credit profile not found.' });
    }

    const amount = parseFloat(totalAmount);

    // 1. RUN CREDIT RISK EVALUATOR & ENFORCER
    const riskResult = await evaluateCreditRisk(customerId, amount);
    if (!riskResult.allowed) {
      logAudit({
        userId: req.user.id,
        actorName: req.user.fullName,
        action: 'CREDIT_PURCHASE_REJECTED_BY_RISK_ENGINE',
        resource: `Customer #${customerId}`,
        details: { requestedAmount: amount, reason: riskResult.reason }
      });
      return res.status(400).json({
        error: 'Credit Transaction Blocked by Risk Assessment Engine',
        reason: riskResult.reason,
        details: riskResult
      });
    }

    // 2. CREATE TRANSACTION IN TRANSACTION BLOCK
    const txRef = `DUBE-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);

    const txData = await db.transaction(async (client) => {
      // Insert credit transaction
      const resTx = await client.query(`
        INSERT INTO credit_transactions (transaction_ref, customer_id, merchant_id, items_json, total_amount, due_date, status, notes)
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7) RETURNING id
      `, [txRef, customerId, merchant.id, itemsJson, amount, dueDate, notes || null]);
      const txId = resTx.rows[0].id;

      // Update customer balance
      const newBalance = parseFloat(customer.current_balance) + amount;
      await client.query('UPDATE customer_profiles SET current_balance = $1 WHERE id = $2', [newBalance, customerId]);

      return {
        id: txId,
        txRef,
        totalAmount: amount,
        dueDate,
        status: 'PENDING',
        newBalance
      };
    });

    // Send Instant SMS Notification to Customer
    const smsMessage = getTemplate('CREDIT_ISSUED', {
      customerName: customer.full_name,
      storeName: merchant.store_name,
      amount: amount.toFixed(2),
      date: new Date().toLocaleDateString(),
      dueDate,
      totalBalance: txData.newBalance.toFixed(2)
    });
    sendSMS({ customerId, phone: customer.phone, message: smsMessage, type: 'CREDIT_ISSUED' });

    // Audit Log
    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'CREDIT_TRANSACTION_LOGGED',
      resource: `Tx #${txRef}`,
      details: { customerId, amount, dueDate, storeName: merchant.store_name }
    });

    res.status(201).json({
      message: 'Credit transaction logged successfully.',
      transaction: txData
    });
  } catch (err) {
    console.error('Create Credit Tx Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Get merchant ledger transactions
async function getMerchantTransactions(req, res) {
  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const transactions = await db.all(`
      SELECT ct.*, cp.full_name as customer_name, cp.phone as customer_phone, cp.fayda_id as customer_fayda_id
      FROM credit_transactions ct
      JOIN customer_profiles cp ON ct.customer_id = cp.id
      WHERE ct.merchant_id = $1
      ORDER BY ct.created_at DESC
    `, [merchant.id]);

    const formatted = transactions.map(t => ({
      ...t,
      items: JSON.parse(t.items_json || '[]')
    }));

    const repayments = await db.all(`
      SELECT r.*, cp.full_name as customer_name, cp.phone as customer_phone, cp.fayda_id as customer_fayda_id, ct.transaction_ref,
        (SELECT COUNT(*) FROM repayments r2 WHERE UPPER(TRIM(r2.reference_code)) = UPPER(TRIM(r.reference_code))) as ref_usage_count,
        (SELECT COUNT(*) FROM repayments r3 WHERE r3.receipt_url = r.receipt_url AND r.receipt_url IS NOT NULL) as image_usage_count
      FROM repayments r
      JOIN customer_profiles cp ON r.customer_id = cp.id
      LEFT JOIN credit_transactions ct ON r.transaction_id = ct.id
      WHERE r.merchant_id = $1
      ORDER BY r.created_at DESC
    `, [merchant.id]);

    res.json({ transactions: formatted, repayments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Trigger SMS Debt Reminder for a Customer
async function triggerSMSReminder(req, res) {
  const { customerId, customMessage, type } = req.body;

  try {
    const merchant = await db.get('SELECT id, store_name FROM merchants WHERE user_id = $1', [req.user.id]);
    const customer = await db.get('SELECT * FROM customer_profiles WHERE id = $1 AND merchant_id = $2', [customerId, merchant.id]);

    if (!customer) {
      return res.status(404).json({ error: 'Customer credit profile not found.' });
    }

    // Get earliest pending transaction due date
    const pendingTx = await db.get(`
      SELECT due_date, total_amount FROM credit_transactions 
      WHERE customer_id = $1 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE') 
      ORDER BY due_date ASC LIMIT 1
    `, [customerId]);

    const alertType = type || (customer.status === 'RESTRICTED' ? 'OVERDUE_ALERT' : 'REMINDER');
    const msg = customMessage || getTemplate(alertType, {
      customerName: customer.full_name,
      storeName: merchant.store_name,
      amount: parseFloat(customer.current_balance).toFixed(2),
      dueDate: pendingTx ? pendingTx.due_date : 'N/A'
    });

    const smsResult = await sendSMS({
      customerId: customer.id,
      phone: customer.phone,
      message: msg,
      type: alertType
    });

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'SMS_REMINDER_TRIGGERED',
      resource: `Customer #${customer.id}`,
      details: { phone: customer.phone, type: alertType, gateway: smsResult.gateway || 'SIMULATION' }
    });

    res.json({
      message: `SMS alert dispatched to ${customer.phone}`,
      sms: smsResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// SMS history for this merchant's own customers. Ownership is derived from the
// authenticated user, never from the request, so one merchant cannot read
// another merchant's message log.
async function getMerchantSMSHistory(req, res) {
  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const rows = await db.all(`
      SELECT s.id, s.customer_id, s.phone, s.type, s.status, s.sent_at, s.message
      FROM sms_notifications s
      WHERE s.customer_id IN (SELECT id FROM customer_profiles WHERE merchant_id = $1)
      ORDER BY s.sent_at DESC
      LIMIT 200
    `, [merchant.id]);

    const summary = rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      messages: rows,
      summary,
      // Surfaced so the UI can tell a gateway rejection apart from a
      // successful send. Rows are written before the gateway call, so
      // SIMULATED means nothing was billed or delivered.
      gatewayNote: 'SIMULATED rows were not delivered. FAILED rows were rejected by the SMS gateway.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Approve or Reject an Uploaded Receipt Repayment
async function approveRepayment(req, res) {
  const { repaymentId, action } = req.body;

  try {
    const result = await approveUploadedReceipt({
      repaymentId,
      action,
      merchantUserId: req.user.id,
      actorName: req.user.fullName
    });

    res.json(result);
  } catch (err) {
    console.error('Approve Repayment Error:', err);
    res.status(400).json({ error: err.message });
  }
}

async function getEscalationCases(req, res) {
  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const cases = await fetchEscalationCases(merchant.id);
    res.json({ cases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function triggerEscalationWarning(req, res) {
  const { caseId } = req.body;

  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const escalationCase = await getEscalationCaseById(caseId, merchant.id);
    if (!escalationCase) {
      return res.status(404).json({ error: 'Escalation case not found.' });
    }

    const result = await sendWarning(caseId, {
      trigger: 'MANUAL',
      actorUserId: req.user.id,
      actorName: req.user.fullName
    });

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'ESCALATION_WARNING_TRIGGERED',
      resource: `Escalation Case #${caseId}`,
      details: { customerId: escalationCase.customer_id, amount: escalationCase.amount }
    });

    res.json({
      message: 'Warning SMS sent to customer. The court letter is now on their Smart Dube page.',
      escalation: result
    });
  } catch (err) {
    // A warning that clashes with an already-sent court letter is the merchant's
    // mistake to fix, not a server fault.
    res.status(409).json({ error: err.message });
  }
}

async function triggerCourtLetter(req, res) {
  const { caseId } = req.body;

  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const escalationCase = await getEscalationCaseById(caseId, merchant.id);
    if (!escalationCase) {
      return res.status(404).json({ error: 'Escalation case not found.' });
    }

    const result = await sendCourtLetter(caseId, {
      trigger: 'MANUAL',
      actorUserId: req.user.id,
      actorName: req.user.fullName
    });

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'COURT_LETTER_TRIGGERED',
      resource: `Escalation Case #${caseId}`,
      details: { customerId: escalationCase.customer_id, amount: escalationCase.amount, letterRef: result.letterRef }
    });

    // The letter is on the customer's page either way, so the difference is only
    // whether they have been told about it. Say so honestly rather than reporting
    // a send that no gateway accepted.
    if (!result.delivered) {
      return res.status(502).json({
        error: 'The court letter is on the customer page, but the SMS could not be delivered. Please try sending it again.',
        letterRef: result.letterRef,
        escalation: result
      });
    }

    res.json({
      message: 'Court letter sent to the customer by SMS. It has been on their Smart Dube page for the full grace period.',
      letterRef: result.letterRef,
      courtLetter: result.courtLetterBody,
      escalation: result
    });
  } catch (err) {
    // Sending a court letter inside the grace period, or sending a second one, is
    // a merchant-correctable conflict rather than a server fault.
    res.status(409).json({ error: err.message });
  }
}

async function resolveEscalationCase(req, res) {
  const { caseId } = req.params;
  const { notes } = req.body;

  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const result = await resolveCase(caseId, merchant.id, notes);

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'ESCALATION_CASE_RESOLVED',
      resource: `Escalation Case #${caseId}`,
      details: { notes }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function closeEscalationCase(req, res) {
  const { caseId } = req.params;
  const { notes } = req.body;

  try {
    const merchant = await db.get('SELECT id FROM merchants WHERE user_id = $1', [req.user.id]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant account not linked.' });
    }

    const result = await closeCase(caseId, merchant.id, notes);

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'ESCALATION_CASE_CLOSED',
      resource: `Escalation Case #${caseId}`,
      details: { notes }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getMerchantProfile,
  getMerchantCustomers,
  registerCustomerProfile,
  updateCustomerProfile,
  updateMerchantBankAccount,
  createCreditTransaction,
  getMerchantTransactions,
  triggerSMSReminder,
  getMerchantSMSHistory,
  approveRepayment,
  getEscalationCases,
  triggerEscalationWarning,
  triggerCourtLetter,
  resolveEscalationCase,
  closeEscalationCase
};
