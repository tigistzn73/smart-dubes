const { validationResult } = require('express-validator');

function validateResult(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const errorMessages = errorList.map(err => err.msg).filter(Boolean);
    const uniqueMessages = Array.from(new Set(errorMessages));
    const combinedMessage = uniqueMessages.join('. ') || 'Validation failed for request payload';

    return res.status(400).json({
      error: combinedMessage,
      message: combinedMessage,
      details: errorList.map(err => ({ field: err.path || err.param, message: err.msg })),
      errors: uniqueMessages
    });
  }
  next();
}

module.exports = {
  validateResult
};
