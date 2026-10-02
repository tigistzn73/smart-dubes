const db = require('../config/database');
const { getGatewayLogs, handleGatewayWebhook } = require('../services/paymentGatewayService');
const { getAuditLogs, logAudit } = require('../services/auditService');
const { runSweep, WARNING_PERIOD_DAYS } = require('../services/escalationService');

// Get overview stats & merchant KYC queue
async function getAdminDashboard(req, res) {
  try {
    const totalMerchantsRes = await db.get('SELECT COUNT(*) as count FROM merchants');
    const totalMerchants = parseInt(totalMerchantsRes.count || 0);

    const pendingKycCountRes = await db.get("SELECT COUNT(*) as count FROM merchants WHERE kyc_status = 'PENDING'");
    const pendingKycCount = parseInt(pendingKycCountRes.count || 0);

    const totalCustomersRes = await db.get('SELECT COUNT(*) as count FROM customer_profiles');
    const totalCustomers = parseInt(totalCustomersRes.count || 0);

    const totalDubeIssuedRes = await db.get('SELECT SUM(total_amount) as total FROM credit_transactions');
    const totalDubeIssued = parseFloat(totalDubeIssuedRes.total || 0);

    const totalRepaymentsRes = await db.get('SELECT SUM(amount) as total FROM repayments');
    const totalRepayments = parseFloat(totalRepaymentsRes.total || 0);

    const pendingMerchants = await db.all(`
      SELECT m.*, u.full_name as owner_name, u.phone, u.email, u.fayda_id
      FROM merchants m
      JOIN users u ON m.user_id = u.id
      ORDER BY m.kyc_status ASC, m.id DESC
    `);

    const recentTransactions = await db.all(`
      SELECT id, total_amount, created_at FROM credit_transactions
      ORDER BY id DESC LIMIT 100
    `);

    res.json({
      metrics: {
        totalMerchants,
        pendingKycCount,
        totalCustomers,
        totalDubeIssued,
        totalRepayments,
        outstandingDebt: Math.max(0, totalDubeIssued - totalRepayments)
      },
      merchants: pendingMerchants,
      transactions: recentTransactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Merchant KYC Verification & Approval / Rejection
async function verifyMerchantKYC(req, res) {
  const { merchantId } = req.params;
  const { status, notes } = req.body;

  try {
    if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid KYC status value.' });
    }

    const merchant = await db.get('SELECT * FROM merchants WHERE id = $1', [merchantId]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant record not found.' });
    }

    const verifiedAt = status === 'VERIFIED' ? new Date().toISOString() : null;

    await db.run(`
      UPDATE merchants 
      SET kyc_status = $1, verified_at = $2, kyc_notes = $3 
      WHERE id = $4
    `, [status, verifiedAt, notes || null, merchantId]);

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: `MERCHANT_KYC_${status}`,
      resource: `Merchant #${merchantId} (${merchant.store_name})`,
      details: { previousStatus: merchant.kyc_status, newStatus: status, notes }
    });

    res.json({
      message: `Merchant KYC status updated to ${status}.`,
      merchantId,
      status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Payment Gateway Performance & Traffic Logs
async function getPaymentGatewayDiagnostics(req, res) {
  try {
    const logs = await getGatewayLogs();
    
    // Gateway summary breakdown
    const telebirrCountRes = await db.get("SELECT COUNT(*) as count FROM payment_gateway_logs WHERE gateway_name = 'TELEBIRR'");
    const telebirrCount = parseInt(telebirrCountRes.count || 0);

    const chapaCountRes = await db.get("SELECT COUNT(*) as count FROM payment_gateway_logs WHERE gateway_name = 'CHAPA'");
    const chapaCount = parseInt(chapaCountRes.count || 0);

    const cbeCountRes = await db.get("SELECT COUNT(*) as count FROM payment_gateway_logs WHERE gateway_name = 'CBE_BIRR'");
    const cbeCount = parseInt(cbeCountRes.count || 0);

    res.json({
      stats: {
        telebirrCount,
        chapaCount,
        cbeCount,
        totalLogs: logs.length
      },
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Trigger Simulated Webhook for Telebirr/Chapa/CBE Birr
async function triggerSimulatedWebhook(req, res) {
  const { gateway, payload } = req.body;

  try {
    const result = await handleGatewayWebhook(gateway || 'TELEBIRR', payload || { txRef: 'TEST-WEBHOOK', amount: 500, status: 'SUCCESS' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Audit Logs Explorer
async function fetchAuditLogs(req, res) {
  try {
    const logs = await getAuditLogs(100);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Force the overdue-debt sweep to run now instead of waiting for the daily timer.
// Admin-only: the sweep sends real SMS in live mode, so it must not be
// reachable by merchants or customers.
async function runEscalationSweepNow(req, res) {
  try {
    const result = await runSweep({ force: true });

    logAudit({
      userId: req.user.id,
      actorName: req.user.fullName,
      action: 'ESCALATION_SWEEP_FORCED',
      resource: 'Debt Escalation Sweep',
      details: { checked: result.checked || 0, counts: result.counts || {} }
    });

    res.json({
      message: 'Overdue debt sweep executed.',
      warningPeriodDays: WARNING_PERIOD_DAYS,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAdminDashboard,
  verifyMerchantKYC,
  getPaymentGatewayDiagnostics,
  triggerSimulatedWebhook,
  fetchAuditLogs,
  runEscalationSweepNow
};
