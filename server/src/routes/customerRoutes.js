const express = require('express');
const { body } = require('express-validator');
const {
  getCustomerDashboard,
  initiateRepayment,
  generateInstallmentSchedule,
  saveCustomerSchedule
} = require('../controllers/customerController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateResult } = require('../middleware/validate');

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('CUSTOMER', 'ADMIN', 'MERCHANT'));

router.get('/dashboard', getCustomerDashboard);

router.post(
  '/repay',
  [
    body('transactionId').notEmpty().withMessage('Transaction ID is required'),
    body('customerId').notEmpty().withMessage('Customer profile ID is required'),
    body('amount').isNumeric().withMessage('Repayment amount must be a number'),
    body('paymentGateway').isIn(['TELEBIRR', 'CHAPA', 'CBE_BIRR', 'CASH', 'RECEIPT_UPLOAD']).withMessage('Invalid payment gateway choice'),
    validateResult
  ],
  initiateRepayment
);

const scheduleValidators = [
  body('frequency').optional().isIn(['WEEKLY', 'MONTHLY']).withMessage('Invalid repayment frequency'),
  body('numInstallments').optional().isInt({ min: 1, max: 24 }).withMessage('Installment count must be between 1 and 24'),
  body('totalAmount').optional().isNumeric().withMessage('Total amount must be a number'),
  body('txIds').optional().isArray().withMessage('txIds must be an array of Dube receipt IDs'),
  body('txId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('txId must be a Dube receipt ID'),
  validateResult
];

router.post('/schedule', scheduleValidators, generateInstallmentSchedule);
router.post('/schedule/apply', scheduleValidators, saveCustomerSchedule);

module.exports = router;
