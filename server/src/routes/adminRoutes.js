const express = require('express');
const { body } = require('express-validator');
const {
  getAdminDashboard,
  verifyMerchantKYC,
  getPaymentGatewayDiagnostics,
  triggerSimulatedWebhook,
  fetchAuditLogs,
  runEscalationSweepNow
} = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateResult } = require('../middleware/validate');

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

router.get('/dashboard', getAdminDashboard);
router.put('/kyc/:merchantId', verifyMerchantKYC);
router.get('/gateways', getPaymentGatewayDiagnostics);
router.post('/webhook-test', triggerSimulatedWebhook);
router.post('/escalations/run', runEscalationSweepNow);
router.get('/audit-logs', fetchAuditLogs);

module.exports = router;
