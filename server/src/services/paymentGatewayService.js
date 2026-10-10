const db = require('../config/database');
const { sendSMS, getTemplate } = require('./smsService');
const { logAudit } = require('./auditService');
const { resolveCasesForSettledTransactions } = require('./escalationService');

// Clearing any open warning or court letter is bookkeeping on top of a
// successful payment, so it must never be able to fail the payment itself.
async function settleEscalations(transactionIds) {
  try {
    await resolveCasesForSettledTransactions(transactionIds);
  } catch (err) {
    console.error('[ESCALATION] Could not auto-resolve escalation cases:', err.message);
  }
}

/**
 * Process a repayment transaction from Telebirr, Chapa, or CBE Birr
 */
async function processRepayment({ transactionId, customerId, amount, gateway, referenceCode, receiptUrl, userId, actorName, installmentNo }) {
  const transaction = await db.get('SELECT * FROM credit_transactions WHERE id = $1', [transactionId]);
  if (!transaction) {
    throw new Error('Credit transaction record not found.');
  }

  const customer = await db.get('SELECT * FROM customer_profiles WHERE id = $1', [customerId]);
  if (!customer) {
    throw new Error('Customer profile not found.');
  }

  const merchant = await db.get('SELECT * FROM merchants WHERE id = $1', [transaction.merchant_id]);

  // 1. Strict Validation: Reference Code is Required and must match real gateway formats
  if (!referenceCode || !String(referenceCode).trim()) {
    throw new Error('Transaction reference code is strictly required. Test sample entries are restricted.');
  }

  const refCode = String(referenceCode).trim();
  const cleanRef = refCode.toUpperCase();
  let isValidFormat = false;

  if (gateway === 'TELEBIRR') {
    isValidFormat = /^(FT[A-Z0-9]{6,16}|TB[0-9]{6,16}|TELEBIRR-[0-9]{6,16})$/i.test(cleanRef);
  } else if (gateway === 'CBE_BIRR') {
    isValidFormat = /^(CBE[0-9]{6,16}|TX[0-9]{6,16}|CBEBIRR-[0-9]{6,16})$/i.test(cleanRef);
  } else if (gateway === 'CHAPA') {
    isValidFormat = /^(CP-[0-9]{6,16}|CHAPA-[0-9]{6,16}|CHP_[A-Z0-9]{6,16})$/i.test(cleanRef);
  } else if (gateway === 'RECEIPT_UPLOAD') {
    // Receipt can be from ANY gateway — Telebirr FT.../TB..., CBE CBE.../TX..., Chapa CP-.../CHAPA-..., or generic REC-...
    // Accept: 8+ alphanumeric chars that aren't purely test/dummy strings
    const dummyPatterns = /^(TEST|DUMMY|SAMPLE|EXAMPLE|12345678|ABCDEFGH|AAAAAAAA)$/i;
    isValidFormat = cleanRef.length >= 8 && !dummyPatterns.test(cleanRef) &&
      /^[A-Z0-9_\-]{8,30}$/i.test(cleanRef);
  } else {
    isValidFormat = cleanRef.length >= 8;
  }

  if (!isValidFormat) {
    const examples = {
      TELEBIRR: 'FT2408181234 or TB88491290',
      CBE_BIRR: 'CBE84791024 or TX84719283',
      CHAPA: 'CP-99018274 or CHAPA-984712',
      RECEIPT_UPLOAD: 'FT26230BITM72 (Telebirr) or CBE84791024 (CBE)'
    };
    throw new Error(`Invalid ${gateway} reference code "${refCode}". Enter your official transaction ID from your payment SMS (e.g. ${examples[gateway] || 'FT2408181234'}).`);
  }

  // 2. Strict Validation for Receipt Upload
  const isReceiptUpload = gateway === 'RECEIPT_UPLOAD';
  if (isReceiptUpload && !receiptUrl) {
    throw new Error('A payment receipt screenshot photo is strictly required for receipt upload verification.');
  }

  // 3. Prevent reuse of reference code (case-insensitive check)
  const existingRepayment = await db.get(
    "SELECT id, status FROM repayments WHERE UPPER(TRIM(reference_code)) = $1 AND status IN ('PENDING', 'COMPLETED')",
    [cleanRef]
  );
  if (existingRepayment) {
    const stateStr = existingRepayment.status === 'PENDING' ? 'pending approval review' : 'already completed';
    throw new Error(`Transaction reference code "${refCode}" has already been submitted and is ${stateStr}. Duplicates are restricted.`);
  }

  // 4. Prevent reuse of identical receipt image screenshot
  if (isReceiptUpload && receiptUrl) {
    const existingImage = await db.get(
      "SELECT id, status FROM repayments WHERE receipt_url = $1 AND status IN ('PENDING', 'COMPLETED')",
      [receiptUrl]
    );
    if (existingImage) {
      const stateStr = existingImage.status === 'PENDING' ? 'pending approval review' : 'already completed';
      throw new Error('This exact receipt screenshot image has already been uploaded for another repayment. Please upload the correct receipt.');
    }
  }

  // Generate unique repayment ref
  const repaymentRef = `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const initialStatus = isReceiptUpload ? 'PENDING' : 'COMPLETED';

  // Run in a database transaction block
  const executePayment = async () => {
    return await db.transaction(async (client) => {
      // 1. Create repayment entry
      await client.query(`
        INSERT INTO repayments (repayment_ref, transaction_id, customer_id, merchant_id, amount, payment_gateway, reference_code, receipt_url, installment_no, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [repaymentRef, transactionId, customerId, transaction.merchant_id, amount, gateway, refCode, receiptUrl || null, installmentNo || null, initialStatus]);

      if (isReceiptUpload) {
        // Log Gateway Flow
        await client.query(`
          INSERT INTO payment_gateway_logs (gateway_name, event_type, payload_json, response_status)
          VALUES ($1, 'RECEIPT_UPLOAD_SUBMITTED', $2, '200_OK')
        `, [gateway, JSON.stringify({ repaymentRef, amount, gateway, refCode, transactionId })]);

        return {
          repaymentRef,
          refCode,
          amount,
          newBalance: parseFloat(customer.current_balance),
          txStatus: transaction.status,
          gateway,
          status: 'PENDING'
        };
      }

      // Standard Instant Payment Gateways (TELEBIRR, CBE_BIRR, CHAPA, CASH)
      // 2. Update customer current balance
      const newBalance = Math.max(0, parseFloat(customer.current_balance) - amount);
      
      // Check if overdue items remain
      const currentDate = new Date().toISOString().split('T')[0];
      const countRes = await client.query(`
        SELECT COUNT(*) as count FROM credit_transactions 
        WHERE customer_id = $1 AND id != $2 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE') AND due_date < $3
      `, [customerId, transactionId, currentDate]);
      const remainingOverdue = parseInt(countRes.rows[0].count || 0);

      const newStatus = (newBalance < parseFloat(customer.credit_limit) && remainingOverdue === 0 && customer.status !== 'BLOCKED') 
        ? 'ACTIVE' 
        : customer.status;

      await client.query('UPDATE customer_profiles SET current_balance = $1, status = $2 WHERE id = $3', [newBalance, newStatus, customerId]);

      // 3. Update transaction status
      const sumRes = await client.query(`
        SELECT SUM(amount) as total FROM repayments WHERE transaction_id = $1 AND status = 'COMPLETED'
      `, [transactionId]);
      const repaymentsSum = parseFloat(sumRes.rows[0].total || 0);

      let txStatus = 'PARTIALLY_PAID';
      if (repaymentsSum >= parseFloat(transaction.total_amount)) {
        txStatus = 'SETTLED';
      }

      await client.query('UPDATE credit_transactions SET status = $1 WHERE id = $2', [txStatus, transactionId]);

      // 4. Log Payment Gateway Flow
      await client.query(`
        INSERT INTO payment_gateway_logs (gateway_name, event_type, payload_json, response_status)
        VALUES ($1, 'PAYMENT_COMPLETED', $2, '200_OK')
      `, [gateway, JSON.stringify({ repaymentRef, amount, gateway, refCode, transactionId })]);

      return {
        repaymentRef,
        refCode,
        amount,
        newBalance,
        txStatus,
        gateway,
        status: 'COMPLETED'
      };
    });
  };

  const result = await executePayment();

  // Async tasks outside transaction execution (non-blocking)
  if (isReceiptUpload) {
    // Send SMS notice to customer that receipt is PENDING
    const msg = `[Smart Dube] Dear ${customer.full_name}, your payment receipt of ${amount.toFixed(2)} ETB has been uploaded to ${merchant ? merchant.store_name : 'your merchant'}. Status: PENDING merchant approval.`;
    sendSMS({ customerId, phone: customer.phone, message: msg, type: 'PAYMENT_RECEIPT' });

    // Log Audit
    logAudit({
      userId,
      actorName: actorName || customer.full_name,
      action: 'RECEIPT_UPLOAD_PENDING_APPROVAL',
      resource: `Repayment #${repaymentRef}`,
      details: { amount, gateway, refCode }
    });
  } else {
    // Send SMS Receipt to the customer
    const smsMessage = getTemplate('PAYMENT_RECEIPT', {
      customerName: customer.full_name,
      amount,
      gateway,
      storeName: merchant ? merchant.store_name : 'Merchant',
      refCode,
      remainingBalance: result.newBalance.toFixed(2)
    });
    sendSMS({ customerId, phone: customer.phone, message: smsMessage, type: 'PAYMENT_RECEIPT' });

    // The debt is gone, so any warning or court letter standing against it must
    // stop showing on the customer's page without waiting for the merchant.
    if (result.txStatus === 'SETTLED') {
      settleEscalations([transactionId]);
    }

    // Notify ALL merchants who have an active credit profile for this customer
    // so every merchant ledger (e.g. Arda and Zemer) receives the payment receipt
    try {
      const allProfiles = await db.all(
        `SELECT cp.id, cp.merchant_id, m.store_name, m.phone as merchant_phone
         FROM customer_profiles cp
         JOIN merchants m ON cp.merchant_id = m.id
         WHERE (cp.phone = $1 OR cp.user_id = $2) AND cp.merchant_id != $3`,
        [customer.phone, customer.user_id || null, transaction.merchant_id]
      );

      for (const profile of allProfiles) {
        if (profile.merchant_phone) {
          const noticeMsg = `[Smart Dube] Payment Notice: Your customer ${customer.full_name} paid ${amount.toFixed(2)} ETB to ${merchant ? merchant.store_name : 'another merchant'} via ${gateway}. Ref: ${refCode}. Their remaining total Dube balance: ${result.newBalance.toFixed(2)} ETB.`;
          sendSMS({ customerId: profile.id, phone: profile.merchant_phone, message: noticeMsg, type: 'PAYMENT_RECEIPT' });
        }
      }
    } catch (notifyErr) {
      console.error('Multi-merchant receipt notify error:', notifyErr.message);
    }

    // Log Audit
    logAudit({
      userId,
      actorName: actorName || customer.full_name,
      action: 'PAYMENT_SETTLEMENT',
      resource: `Repayment #${repaymentRef}`,
      details: { amount, gateway, refCode, newBalance: result.newBalance, txStatus: result.txStatus }
    });
  }

  return result;
}

/**
 * Merchant Approves or Rejects a Pending Receipt Upload Payment
 */
async function approveUploadedReceipt({ repaymentId, action, merchantUserId, actorName }) {
  const merchant = await db.get('SELECT * FROM merchants WHERE user_id = $1', [merchantUserId]);
  if (!merchant) {
    throw new Error('Merchant profile not found.');
  }

  const repayment = await db.get('SELECT * FROM repayments WHERE id = $1 AND merchant_id = $2', [repaymentId, merchant.id]);
  if (!repayment) {
    throw new Error('Repayment record not found or does not belong to this merchant.');
  }

  if (repayment.status !== 'PENDING') {
    throw new Error(`Repayment is already ${repayment.status}.`);
  }

  const customer = await db.get('SELECT * FROM customer_profiles WHERE id = $1', [repayment.customer_id]);
  const transaction = await db.get('SELECT * FROM credit_transactions WHERE id = $1', [repayment.transaction_id]);

  if (action === 'REJECT') {
    await db.run('UPDATE repayments SET status = $1 WHERE id = $2', ['REJECTED', repaymentId]);

    const msg = `[Smart Dube] Payment Receipt Declined. Your uploaded receipt of ${parseFloat(repayment.amount).toFixed(2)} ETB was declined by ${merchant.store_name}. Please re-upload a valid receipt or pay via Telebirr/CBE.`;
    sendSMS({ customerId: customer.id, phone: customer.phone, message: msg, type: 'PAYMENT_RECEIPT' });

    logAudit({
      userId: merchantUserId,
      actorName,
      action: 'RECEIPT_UPLOAD_REJECTED',
      resource: `Repayment #${repayment.repayment_ref}`,
      details: { repaymentId, amount: parseFloat(repayment.amount) }
    });

    return { status: 'REJECTED', message: 'Receipt upload payment was rejected.' };
  }

  // Action: APPROVE
  const executeApproval = async () => {
    return await db.transaction(async (client) => {
      // 1. Mark repayment as COMPLETED
      await client.query('UPDATE repayments SET status = $1 WHERE id = $2', ['COMPLETED', repaymentId]);

      // 1b. Once an uploaded installment receipt is approved, flip that exact
      // installment on the customer's ACTIVE schedule to PAID. It stayed at
      // SCHEDULED (shown as Pending Review) until this moment.
      if (repayment.installment_no) {
        const plan = await client.query(
          `SELECT id, installments_json FROM customer_schedules
           WHERE customer_id = $1 AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`,
          [repayment.customer_id]
        );
        if (plan.rows.length > 0) {
          const planInsts = JSON.parse(plan.rows[0].installments_json || '[]');
          const approvedInsts = planInsts.map(inst =>
            inst.installmentNo === repayment.installment_no ? { ...inst, status: 'PAID' } : inst
          );
          await client.query(
            'UPDATE customer_schedules SET installments_json = $1 WHERE id = $2',
            [JSON.stringify(approvedInsts), plan.rows[0].id]
          );
        }
      }

      // 2. Deduct customer balance
      const newBalance = Math.max(0, parseFloat(customer.current_balance) - parseFloat(repayment.amount));

      const currentDate = new Date().toISOString().split('T')[0];
      const countRes = await client.query(`
        SELECT COUNT(*) as count FROM credit_transactions 
        WHERE customer_id = $1 AND id != $2 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE') AND due_date < $3
      `, [customer.id, transaction ? transaction.id : 0, currentDate]);
      const remainingOverdue = parseInt(countRes.rows[0].count || 0);

      const newStatus = (newBalance < parseFloat(customer.credit_limit) && remainingOverdue === 0 && customer.status !== 'BLOCKED') 
        ? 'ACTIVE' 
        : customer.status;

      await client.query('UPDATE customer_profiles SET current_balance = $1, status = $2 WHERE id = $3', [newBalance, newStatus, customer.id]);

      // 3. Update transaction status if attached
      let txStatus = 'PENDING';
      if (transaction) {
        const sumRes = await client.query(`
          SELECT SUM(amount) as total FROM repayments WHERE transaction_id = $1 AND status = 'COMPLETED'
        `, [transaction.id]);
        const repaymentsSum = parseFloat(sumRes.rows[0].total || 0);

        txStatus = 'PARTIALLY_PAID';
        if (repaymentsSum >= parseFloat(transaction.total_amount)) {
          txStatus = 'SETTLED';
        }
        await client.query('UPDATE credit_transactions SET status = $1 WHERE id = $2', [txStatus, transaction.id]);
      }

      return {
        status: 'COMPLETED',
        newBalance,
        repaymentRef: repayment.repayment_ref,
        amount: parseFloat(repayment.amount),
        txStatus
      };
    });
  };

  const approvalResult = await executeApproval();

  // Async tasks outside transaction committing (non-blocking)
  // Send Payment Successful SMS Notification
  const smsMsg = `[Smart Dube] Payment Receipt Approved! Your payment of ${approvalResult.amount.toFixed(2)} ETB via Receipt Upload has been verified and approved by ${merchant.store_name}. Ref: ${repayment.reference_code}. Remaining Dube Balance: ${approvalResult.newBalance.toFixed(2)} ETB.`;
  sendSMS({ customerId: customer.id, phone: customer.phone, message: smsMsg, type: 'PAYMENT_RECEIPT' });

  // An approved receipt can be the payment that finally clears an escalated debt.
  if (transaction && approvalResult.txStatus === 'SETTLED') {
    settleEscalations([transaction.id]);
  }

  // Audit Log
  logAudit({
    userId: merchantUserId,
    actorName,
    action: 'RECEIPT_UPLOAD_APPROVED',
    resource: `Repayment #${repayment.repayment_ref}`,
    details: { repaymentId, amount: approvalResult.amount, newBalance: approvalResult.newBalance, txStatus: approvalResult.txStatus }
  });

  return {
    status: 'COMPLETED',
    newBalance: approvalResult.newBalance,
    repaymentRef: approvalResult.repaymentRef,
    amount: approvalResult.amount
  };
}

/**
 * Process a multi-merchant repayment transaction from Telebirr, Chapa, CBE Birr or Receipt Upload
 * Distributes payment proportionally across all active merchant ledgers where customer has outstanding debt.
 */
async function processMultiMerchantRepayment({ userId, userPhone, amount, gateway, referenceCode, receiptUrl, actorName, installmentNo }) {
  if (!referenceCode || !String(referenceCode).trim()) {
    throw new Error('Transaction reference code is strictly required. Test sample entries are restricted.');
  }

  const refCode = String(referenceCode).trim();
  const cleanRef = refCode.toUpperCase();
  let isValidFormat = false;

  if (gateway === 'TELEBIRR') {
    isValidFormat = /^(FT[A-Z0-9]{6,16}|TB[0-9]{6,16}|TELEBIRR-[0-9]{6,16})$/i.test(cleanRef);
  } else if (gateway === 'CBE_BIRR') {
    isValidFormat = /^(CBE[0-9]{6,16}|TX[0-9]{6,16}|CBEBIRR-[0-9]{6,16})$/i.test(cleanRef);
  } else if (gateway === 'CHAPA') {
    isValidFormat = /^(CP-[0-9]{6,16}|CHAPA-[0-9]{6,16}|CHP_[A-Z0-9]{6,16})$/i.test(cleanRef);
  } else if (gateway === 'RECEIPT_UPLOAD') {
    const dummyPatterns = /^(TEST|DUMMY|SAMPLE|EXAMPLE|12345678|ABCDEFGH|AAAAAAAA)$/i;
    isValidFormat = cleanRef.length >= 8 && !dummyPatterns.test(cleanRef) &&
      /^[A-Z0-9_\-]{8,30}$/i.test(cleanRef);
  } else {
    isValidFormat = cleanRef.length >= 8;
  }

  if (!isValidFormat) {
    const examples = {
      TELEBIRR: 'FT2408181234 or TB88491290',
      CBE_BIRR: 'CBE84791024 or TX84719283',
      CHAPA: 'CP-99018274 or CHAPA-984712',
      RECEIPT_UPLOAD: 'FT26230BITM72 (Telebirr) or CBE84791024 (CBE)'
    };
    throw new Error(`Invalid ${gateway} reference code "${refCode}". Enter your official transaction ID from your payment SMS (e.g. ${examples[gateway] || 'FT2408181234'}).`);
  }

  const isReceiptUpload = gateway === 'RECEIPT_UPLOAD';
  if (isReceiptUpload && !receiptUrl) {
    throw new Error('A payment receipt screenshot photo is strictly required for receipt upload verification.');
  }

  const existingRepayment = await db.get(
    "SELECT id, status FROM repayments WHERE UPPER(TRIM(reference_code)) = $1 AND status IN ('PENDING', 'COMPLETED')",
    [cleanRef]
  );
  if (existingRepayment) {
    const stateStr = existingRepayment.status === 'PENDING' ? 'pending approval review' : 'already completed';
    throw new Error(`Transaction reference code "${refCode}" has already been submitted and is ${stateStr}. Duplicates are restricted.`);
  }

  const activeProfiles = await db.all(`
    SELECT cp.*, m.store_name, m.phone as merchant_phone
    FROM customer_profiles cp
    JOIN merchants m ON cp.merchant_id = m.id
    WHERE (cp.user_id = $1 OR cp.phone = (SELECT phone FROM users WHERE id = $1) OR cp.phone = $2)
      AND cp.current_balance > 0
    ORDER BY cp.current_balance DESC
  `, [userId, userPhone || '']);

  if (!activeProfiles || activeProfiles.length === 0) {
    throw new Error('No active outstanding merchant balances found to repay.');
  }

  const totalDebt = activeProfiles.reduce((acc, p) => acc + parseFloat(p.current_balance || 0), 0);
  const totalPay = Math.min(amount, totalDebt);

  let remainingPay = totalPay;
  const allocations = activeProfiles.map((p, idx) => {
    let pAmount = 0;
    if (idx === activeProfiles.length - 1) {
      pAmount = Math.max(0, Math.round(remainingPay * 100) / 100);
    } else {
      pAmount = Math.max(0, Math.min(p.current_balance, Math.round((p.current_balance / totalDebt) * totalPay * 100) / 100));
      remainingPay -= pAmount;
    }
    return {
      profile: p,
      amount: pAmount
    };
  }).filter(a => a.amount > 0);

  const initialStatus = isReceiptUpload ? 'PENDING' : 'COMPLETED';
  const masterRepaymentRef = `PAY-MULTI-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const settledTransactionIds = [];

  const executionResults = await db.transaction(async (client) => {
    const results = [];
    for (let i = 0; i < allocations.length; i++) {
      const { profile, amount: pAmount } = allocations[i];
      const subRef = i === 0 ? cleanRef : `${cleanRef}-${i + 1}`;
      const itemRepaymentRef = `${masterRepaymentRef}-${i + 1}`;

      let targetTx = (await client.query(`
        SELECT * FROM credit_transactions
        WHERE customer_id = $1 AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
        ORDER BY created_at ASC LIMIT 1
      `, [profile.id])).rows[0];

      if (!targetTx) {
        targetTx = (await client.query(`
          SELECT * FROM credit_transactions
          WHERE customer_id = $1
          ORDER BY created_at DESC LIMIT 1
        `, [profile.id])).rows[0];
      }

      const txId = targetTx ? targetTx.id : null;

      await client.query(`
        INSERT INTO repayments (repayment_ref, transaction_id, customer_id, merchant_id, amount, payment_gateway, reference_code, receipt_url, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [itemRepaymentRef, txId, profile.id, profile.merchant_id, pAmount, gateway, subRef, receiptUrl || null, initialStatus]);

      if (!isReceiptUpload) {
        const newBal = Math.max(0, parseFloat(profile.current_balance) - pAmount);
        await client.query(`UPDATE customer_profiles SET current_balance = $1 WHERE id = $2`, [newBal, profile.id]);

        if (targetTx) {
          const sumRes = await client.query(`
            SELECT SUM(amount) as total FROM repayments WHERE transaction_id = $1 AND status = 'COMPLETED'
          `, [targetTx.id]);
          const repSum = parseFloat(sumRes.rows[0].total || 0);
          let txStatus = repSum >= parseFloat(targetTx.total_amount) ? 'SETTLED' : 'PARTIALLY_PAID';
          await client.query(`UPDATE credit_transactions SET status = $1 WHERE id = $2`, [txStatus, targetTx.id]);
          if (txStatus === 'SETTLED') settledTransactionIds.push(targetTx.id);
        }
      }

      results.push({
        merchantId: profile.merchant_id,
        storeName: profile.store_name,
        merchantPhone: profile.merchant_phone,
        customerId: profile.id,
        customerName: profile.full_name,
        customerPhone: profile.phone,
        allocatedAmount: pAmount,
        repaymentRef: itemRepaymentRef,
        referenceCode: subRef
      });
    }

    if (installmentNo) {
      const scheduleRow = (await client.query(`
        SELECT * FROM customer_schedules WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1
      `, [userId])).rows[0];

      if (scheduleRow) {
        let installments = JSON.parse(scheduleRow.installments_json || '[]');
        installments = installments.map(inst => {
          if (inst.installmentNo === parseInt(installmentNo)) {
            return { ...inst, status: 'PAID' };
          }
          return inst;
        });
        await client.query(`UPDATE customer_schedules SET installments_json = $1 WHERE id = $2`, [JSON.stringify(installments), scheduleRow.id]);
      }
    }

    await client.query(`
      INSERT INTO payment_gateway_logs (gateway_name, event_type, payload_json, response_status)
      VALUES ($1, 'MULTI_MERCHANT_PAYMENT', $2, '200_OK')
    `, [gateway, JSON.stringify({ masterRepaymentRef, totalPay, gateway, cleanRef, allocations: results })]);

    return results;
  });

  for (const r of executionResults) {
    if (isReceiptUpload) {
      const custMsg = `[Smart Dube] Dear ${r.customerName}, your payment receipt of ${r.allocatedAmount.toFixed(2)} ETB for ${r.storeName} has been uploaded. Status: PENDING merchant approval.`;
      sendSMS({ customerId: r.customerId, phone: r.customerPhone, message: custMsg, type: 'PAYMENT_RECEIPT' });
    } else {
      const custMsg = `[Smart Dube] Dear ${r.customerName}, your multi-store schedule payment of ${r.allocatedAmount.toFixed(2)} ETB to ${r.storeName} via ${gateway} is CONFIRMED. Ref: ${r.referenceCode}.`;
      sendSMS({ customerId: r.customerId, phone: r.customerPhone, message: custMsg, type: 'PAYMENT_RECEIPT' });

      if (r.merchantPhone) {
        const merchMsg = `[Smart Dube] Payment Receipt: Customer ${r.customerName} has paid ${r.allocatedAmount.toFixed(2)} ETB to your store via ${gateway}. Ref: ${r.referenceCode}.`;
        sendSMS({ customerId: r.customerId, phone: r.merchantPhone, message: merchMsg, type: 'PAYMENT_RECEIPT' });
      }
    }
  }

  logAudit({
    userId,
    actorName: actorName || 'Customer',
    action: 'MULTI_MERCHANT_SCHEDULE_REPAYMENT',
    resource: `Master Repayment #${masterRepaymentRef}`,
    details: { totalAmount: totalPay, gateway, cleanRef, allocations: executionResults }
  });

  // A single multi-store payment can clear debts at several shops at once.
  if (settledTransactionIds.length > 0) {
    settleEscalations(settledTransactionIds);
  }

  return {
    isMultiMerchant: true,
    repaymentRef: masterRepaymentRef,
    amount: totalPay,
    gateway,
    referenceCode: cleanRef,
    status: initialStatus,
    allocations: executionResults
  };
}

/**
 * Handle incoming Payment Gateway Webhook (Telebirr / CBE Birr / Chapa)
 */
async function handleGatewayWebhook(gateway, payload) {
  await db.run(`
    INSERT INTO payment_gateway_logs (gateway_name, event_type, payload_json, response_status)
    VALUES ($1, 'WEBHOOK_RECEIVED', $2, '200_OK')
  `, [gateway, JSON.stringify(payload)]);

  logAudit({
    actorName: `WEBHOOK_${gateway}`,
    action: 'GATEWAY_WEBHOOK_RECEIVED',
    resource: gateway,
    details: payload
  });

  return { status: 'SUCCESS', message: 'Webhook event processed and logged.' };
}

async function getGatewayLogs() {
  return await db.all('SELECT * FROM payment_gateway_logs ORDER BY created_at DESC LIMIT 50');
}

module.exports = {
  processRepayment,
  processMultiMerchantRepayment,
  approveUploadedReceipt,
  handleGatewayWebhook,
  getGatewayLogs
};
