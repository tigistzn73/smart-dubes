const swaggerUi = require('swagger-ui-express');

const bearerAuth = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT'
  }
};

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

const jsonBody = (properties, required) => ({
  required: true,
  content: {
    'application/json': {
      schema: { type: 'object', properties, required: required || [] }
    }
  }
});

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Smart Dube REST API',
    version: '1.0.0',
    description:
      'Credit management platform for Ethiopian merchants and their customers.\n\n' +
      '**Demo logins** (seeded database)\n' +
      '- Admin: `+251987005355` / `admin123`\n' +
      '- Merchant: `+251911223344` / `merchant123`\n' +
      '- Customer: `+251933445566` / `customer123`\n\n' +
      'Call `POST /api/auth/login`, then paste the returned `token` into the **Authorize** button at the top right.'
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'System', description: 'Health and diagnostics' },
    { name: 'Auth', description: 'Registration, login and password reset' },
    { name: 'Merchant', description: 'Merchant-scoped operations (ADMIN or MERCHANT role)' },
    { name: 'Customer', description: 'Customer-scoped operations' },
    { name: 'Admin', description: 'Platform administration (ADMIN role only)' }
  ],
  components: {
    securitySchemes: bearerAuth,
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } }
      }
    }
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Returns service status and reports whether storage is persistent.',
        security: [],
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'HEALTHY' },
                    service: { type: 'string', example: 'Smart Dube REST API' },
                    timestamp: { type: 'string', format: 'date-time' },
                    storage: {
                      type: 'object',
                      properties: {
                        driver: { type: 'string', example: 'POSTGRESQL' },
                        persistent: { type: 'boolean', example: true },
                        warning: { type: 'string', nullable: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        security: [],
        requestBody: jsonBody(
          {
            fullName: { type: 'string', example: 'Abebe Bikila' },
            phone: { type: 'string', example: '+251911223344' },
            password: { type: 'string', minLength: 6, example: 'merchant123' },
            role: { type: 'string', enum: ['ADMIN', 'MERCHANT', 'CUSTOMER'] },
            email: { type: 'string', format: 'email' },
            faydaId: { type: 'string', example: 'FYD-4455-6677-88' },
            photoUrl: { type: 'string' },
            storeName: { type: 'string', description: 'MERCHANT only' },
            businessLicenseNo: { type: 'string', description: 'MERCHANT only' },
            address: { type: 'string', description: 'MERCHANT only' }
          },
          ['fullName', 'phone', 'password', 'role']
        ),
        responses: {
          201: { description: 'User created' },
          400: errorResponse,
          409: { description: 'Phone or email already exists' }
        }
      }
    },

    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a JWT',
        description:
          'Returns `{ message, token, user }`. Three consecutive failed attempts lock the account for 5 minutes.',
        security: [],
        requestBody: jsonBody(
          {
            phone: { type: 'string', example: '+251987005355' },
            password: { type: 'string', example: 'admin123' }
          },
          ['phone', 'password']
        ),
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Login successful' },
                    token: { type: 'string', description: 'Paste into Authorize' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        fullName: { type: 'string' },
                        phone: { type: 'string' },
                        role: { type: 'string', enum: ['ADMIN', 'MERCHANT', 'CUSTOMER'] },
                        faydaId: { type: 'string' },
                        merchant: { type: 'object', nullable: true },
                        customerProfile: { type: 'object', nullable: true }
                      }
                    }
                  }
                }
              }
            }
          },
          401: errorResponse,
          429: { description: 'Account locked after 3 failed attempts' }
        }
      }
    },

    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request an OTP reset PIN',
        security: [],
        requestBody: jsonBody({ phone: { type: 'string', example: '+251987005355' } }, ['phone']),
        responses: { 200: { description: 'OTP dispatched' }, 404: errorResponse }
      }
    },

    '/api/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset the password using an OTP',
        security: [],
        requestBody: jsonBody(
          {
            phone: { type: 'string', example: '+251987005355' },
            otpCode: { type: 'string', minLength: 6, maxLength: 6, example: '123456' },
            newPassword: { type: 'string', minLength: 6, example: 'newpass123' }
          },
          ['phone', 'otpCode', 'newPassword']
        ),
        responses: { 200: { description: 'Password changed' }, 400: errorResponse }
      }
    },

    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the authenticated user',
        responses: { 200: { description: 'Current user' }, 401: errorResponse }
      }
    },

    '/api/merchant/profile': {
      get: {
        tags: ['Merchant'],
        summary: 'Merchant profile and bank account',
        responses: { 200: { description: 'Merchant profile' }, 401: errorResponse, 403: errorResponse }
      }
    },

    '/api/merchant/customers': {
      get: {
        tags: ['Merchant'],
        summary: 'List customers registered under this merchant',
        responses: { 200: { description: 'Customer list' }, 401: errorResponse }
      },
      post: {
        tags: ['Merchant'],
        summary: 'Register a customer profile',
        requestBody: jsonBody(
          {
            fullName: { type: 'string', example: 'Dawit Yohannes' },
            phone: { type: 'string', example: '+251933445566' },
            faydaId: { type: 'string', description: 'Required for KYC compliance', example: 'FYD-9988-7766-55' },
            photoUrl: { type: 'string' },
            creditLimit: { type: 'number', example: 8000 }
          },
          ['fullName', 'phone', 'faydaId']
        ),
        responses: { 201: { description: 'Customer created' }, 400: errorResponse }
      }
    },

    '/api/merchant/customers/{customerId}': {
      put: {
        tags: ['Merchant'],
        summary: 'Update a customer credit limit or status',
        parameters: [
          { name: 'customerId', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        requestBody: jsonBody({
          creditLimit: { type: 'number', minimum: 0, example: 5000 },
          status: { type: 'string', enum: ['ACTIVE', 'RESTRICTED', 'BLOCKED'] }
        }),
        responses: { 200: { description: 'Customer updated' }, 400: errorResponse, 404: errorResponse }
      }
    },

    '/api/merchant/bank-account': {
      put: {
        tags: ['Merchant'],
        summary: 'Update the settlement bank account',
        requestBody: jsonBody({
          bankName: { type: 'string', maxLength: 100, example: 'Commercial Bank of Ethiopia' },
          accountName: { type: 'string', maxLength: 200, example: 'Abebe Bikila' },
          accountNumber: { type: 'string', maxLength: 50, example: '1000123456789' }
        }),
        responses: { 200: { description: 'Bank account updated' }, 400: errorResponse }
      }
    },

    '/api/merchant/transactions': {
      get: {
        tags: ['Merchant'],
        summary: 'List credit transactions',
        responses: { 200: { description: 'Transaction list' }, 401: errorResponse }
      },
      post: {
        tags: ['Merchant'],
        summary: 'Create a credit transaction',
        requestBody: jsonBody(
          {
            customerId: { type: 'integer', example: 1 },
            totalAmount: { type: 'number', example: 1000 },
            dueDate: { type: 'string', example: '2026-10-30' },
            items: { type: 'array', items: { type: 'object' }, description: 'Optional line items' },
            notes: { type: 'string' }
          },
          ['customerId', 'totalAmount', 'dueDate']
        ),
        responses: { 201: { description: 'Transaction created' }, 400: errorResponse }
      }
    },

    '/api/merchant/sms-reminder': {
      post: {
        tags: ['Merchant'],
        summary: 'Send an SMS repayment reminder',
        description: 'Uses the Africa\'s Talking gateway in SANDBOX mode.',
        requestBody: jsonBody(
          {
            customerId: { type: 'integer', example: 1 },
            customMessage: { type: 'string' },
            type: { type: 'string', description: 'Reminder variant' }
          },
          ['customerId']
        ),
        responses: { 200: { description: 'Reminder sent' }, 400: errorResponse }
      }
    },

    '/api/merchant/approve-repayment': {
      post: {
        tags: ['Merchant'],
        summary: 'Approve or reject a pending repayment',
        requestBody: jsonBody(
          {
            repaymentId: { type: 'integer', example: 1 },
            action: { type: 'string', enum: ['APPROVE', 'REJECT'] }
          },
          ['repaymentId', 'action']
        ),
        responses: { 200: { description: 'Repayment processed' }, 400: errorResponse, 404: errorResponse }
      }
    },

    '/api/customer/dashboard': {
      get: {
        tags: ['Customer'],
        summary: 'Customer dashboard summary',
        responses: { 200: { description: 'Dashboard data' }, 401: errorResponse }
      }
    },

    '/api/customer/repay': {
      post: {
        tags: ['Customer'],
        summary: 'Initiate a repayment',
        requestBody: jsonBody(
          {
            transactionId: { type: 'integer', example: 1 },
            customerId: { type: 'integer', example: 1 },
            amount: { type: 'number', example: 500 },
            paymentGateway: {
              type: 'string',
              enum: ['TELEBIRR', 'CHAPA', 'CBE_BIRR', 'CASH', 'RECEIPT_UPLOAD']
            },
            referenceCode: { type: 'string', description: 'Gateway transaction reference' },
            receiptUrl: { type: 'string', description: 'For RECEIPT_UPLOAD' },
            installmentNo: { type: 'integer' },
            isMultiMerchant: { type: 'boolean' }
          },
          ['transactionId', 'customerId', 'amount', 'paymentGateway']
        ),
        responses: { 200: { description: 'Repayment initiated' }, 400: errorResponse }
      }
    },

    '/api/customer/schedule': {
      post: {
        tags: ['Customer'],
        summary: 'Preview an installment schedule',
        description: 'Generates a schedule without saving it. Use `/schedule/apply` to persist.',
        requestBody: jsonBody({
          totalAmount: { type: 'number', example: 4000 },
          frequency: { type: 'string', enum: ['WEEKLY', 'MONTHLY'] },
          firstPaymentDate: { type: 'string', example: '2026-10-01' },
          numInstallments: { type: 'integer', minimum: 1, maximum: 24, example: 4 },
          merchantId: { type: 'integer' },
          deadlineDate: { type: 'string' },
          txId: { type: 'integer', description: 'Single Dube receipt ID' },
          txIds: { type: 'array', items: { type: 'integer' }, description: 'Multiple Dube receipt IDs' }
        }),
        responses: { 200: { description: 'Generated schedule' }, 400: errorResponse }
      }
    },

    '/api/customer/schedule/apply': {
      post: {
        tags: ['Customer'],
        summary: 'Generate and save an installment schedule',
        requestBody: jsonBody({
          totalAmount: { type: 'number', example: 4000 },
          frequency: { type: 'string', enum: ['WEEKLY', 'MONTHLY'] },
          firstPaymentDate: { type: 'string', example: '2026-10-01' },
          numInstallments: { type: 'integer', minimum: 1, maximum: 24, example: 4 },
          merchantId: { type: 'integer' },
          deadlineDate: { type: 'string' },
          txId: { type: 'integer' },
          txIds: { type: 'array', items: { type: 'integer' } }
        }),
        responses: { 200: { description: 'Schedule saved' }, 400: errorResponse }
      }
    },

    '/api/admin/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Platform-wide dashboard statistics',
        responses: { 200: { description: 'Admin dashboard' }, 401: errorResponse, 403: errorResponse }
      }
    },

    '/api/admin/kyc/{merchantId}': {
      put: {
        tags: ['Admin'],
        summary: 'Approve or reject a merchant KYC check',
        parameters: [
          { name: 'merchantId', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        requestBody: jsonBody({
          status: { type: 'string', example: 'VERIFIED' },
          notes: { type: 'string' }
        }),
        responses: { 200: { description: 'KYC updated' }, 404: errorResponse }
      }
    },

    '/api/admin/gateways': {
      get: {
        tags: ['Admin'],
        summary: 'Payment and SMS gateway diagnostics',
        responses: { 200: { description: 'Gateway status' }, 401: errorResponse }
      }
    },

    '/api/admin/webhook-test': {
      post: {
        tags: ['Admin'],
        summary: 'Trigger a simulated gateway webhook',
        requestBody: jsonBody({
          gateway: { type: 'string', example: 'TELEBIRR' },
          payload: { type: 'object', description: 'Raw gateway payload to simulate' }
        }),
        responses: { 200: { description: 'Webhook processed' }, 400: errorResponse }
      }
    },

    '/api/admin/audit-logs': {
      get: {
        tags: ['Admin'],
        summary: 'Fetch the audit log trail',
        responses: { 200: { description: 'Audit entries' }, 401: errorResponse }
      }
    }
  }
};

function setupSwagger(app) {
  app.get('/api/openapi.json', (req, res) => res.json(swaggerSpec));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Smart Dube API Docs',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true }
    })
  );
}

module.exports = { setupSwagger, swaggerSpec };
