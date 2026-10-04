const express = require('express');
const { body } = require('express-validator');
const { registerUser, loginUser, getMe, forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { validateResult } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/register',
  [
    body('fullName').notEmpty().withMessage('Full name is required').trim(),
    body('phone').notEmpty().withMessage('Phone number is required').trim(),
    // Email is mandatory: it is the channel the password-reset OTP is delivered
    // to, so an account without one cannot be recovered.
    // .trim() runs before isEmail() rather than after. Without it a trailing
    // space — invisible to the person typing, and easy to leave by accident —
    // fails validation with "a valid email address is required" and no way for
    // the user to see why. The controller lowercases it separately.
    body('email')
      .exists({ values: 'falsy' })
      .withMessage('Email is required. It is how you receive password reset verification codes.')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('Email is required. It is how you receive password reset verification codes.')
      .bail()
      .isEmail()
      .withMessage('A valid email address is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['ADMIN', 'MERCHANT', 'CUSTOMER']).withMessage('Role must be ADMIN, MERCHANT, or CUSTOMER'),
    validateResult
  ],
  registerUser
);

router.post(
  '/login',
  [
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validateResult
  ],
  loginUser
);

router.post(
  '/forgot-password',
  [
    body('phone').optional(),
    body('email').optional().isEmail().withMessage('Please provide a valid email address'),
    validateResult
  ],
  (req, res, next) => {
    if (!req.body.phone && !req.body.email) {
      return res.status(400).json({ error: 'Phone number or email is required to receive the verification code' });
    }
    next();
  },
  forgotPassword
);

router.post(
  '/reset-password',
  [
    // The account is identified by `identifier` (an email or a phone number). This
    // used to validate `phone` as mandatory, which rejected every email reset with
    // "Phone number is required" before resetPassword was ever reached, so the code
    // could not be redeemed no matter how correct it was.
    body('otpCode').notEmpty().withMessage('Verification code is required').isLength({ min: 6, max: 6 }).withMessage('Verification code must be exactly 6 digits'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validateResult
  ],
  (req, res, next) => {
    if (!req.body.identifier && !req.body.email && !req.body.phone) {
      return res.status(400).json({ error: 'Email or phone number is required to verify the code' });
    }
    next();
  },
  resetPassword
);

// In-app password change for someone already signed in. Verifies the current
// password directly instead of routing through the OTP reset.
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validateResult
  ],
  authenticateToken,
  changePassword
);

router.get('/me', authenticateToken, getMe);

module.exports = router;
