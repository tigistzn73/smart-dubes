const express = require('express');
const { body } = require('express-validator');
const {
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
  getEscalationLetterImage,
  triggerEscalationWarning,
  triggerCourtLetter,
  resolveEscalationCase,
  closeEscalationCase
} = require('../controllers/merchantController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateResult } = require('../middleware/validate');

const router = express.Router();

// Merchant role restriction
router.use(authenticateToken);
router.use(authorizeRoles('MERCHANT', 'ADMIN'));

router.get('/profile', getMerchantProfile);
router.get('/customers', getMerchantCustomers);

router.post(
  '/customers',
  [
    body('fullName').notEmpty().withMessage('Customer full name is required'),
    body('phone').notEmpty().withMessage('Customer phone number is required'),
    body('faydaId').notEmpty().withMessage('Fayda ID number is required for KYC compliance'),
    validateResult
  ],
  registerCustomerProfile
);

router.put(
  '/customers/:customerId',
  [
    body('creditLimit').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Credit limit must be a number of 0 or more'),
    body('status').optional().isIn(['ACTIVE', 'RESTRICTED', 'BLOCKED']).withMessage('Status must be ACTIVE, RESTRICTED or BLOCKED'),
    validateResult
  ],
  updateCustomerProfile
);

router.put(
  '/bank-account',
  [
    body('bankName').optional().isLength({ max: 100 }).withMessage('Bank name is too long'),
    body('accountName').optional().isLength({ max: 200 }).withMessage('Account name is too long'),
    body('accountNumber').optional().isLength({ max: 50 }).withMessage('Account number is too long'),
    validateResult
  ],
  updateMerchantBankAccount
);

router.post(
  '/transactions',
  [
    body('customerId').notEmpty().withMessage('Customer selection is required'),
    body('totalAmount').isFloat({ gt: 0 }).withMessage('Total credit amount must be a number greater than 0'),
    body('dueDate').notEmpty().withMessage('Repayment due date is required'),
    validateResult
  ],
  createCreditTransaction
);

router.get('/transactions', getMerchantTransactions);

router.get('/sms-history', getMerchantSMSHistory);

router.post(
  '/sms-reminder',
  [
    body('customerId').notEmpty().withMessage('Customer ID is required'),
    validateResult
  ],
  triggerSMSReminder
);

router.post(
  '/approve-repayment',
  [
    body('repaymentId').notEmpty().withMessage('Repayment ID is required'),
    body('action').isIn(['APPROVE', 'REJECT']).withMessage('Action must be APPROVE or REJECT'),
    validateResult
  ],
  approveRepayment
);

router.get('/escalations', getEscalationCases);

router.get(
  '/escalations/:caseId/letter.png',
  getEscalationLetterImage
);

router.post(
  '/escalations/warning',
  [
    body('caseId').notEmpty().withMessage('Escalation case ID is required'),
    validateResult
  ],
  triggerEscalationWarning
);

router.post(
  '/escalations/court-letter',
  [
    body('caseId').notEmpty().withMessage('Escalation case ID is required'),
    validateResult
  ],
  triggerCourtLetter
);

router.put(
  '/escalations/:caseId/resolve',
  resolveEscalationCase
);

router.put(
  '/escalations/:caseId/close',
  closeEscalationCase
);

module.exports = router;
