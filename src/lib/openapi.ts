const success = {
  description: 'Operation result envelope; monetary values are whole AMD decimal strings',
};
const unauthorized = { description: 'Authentication or role check failed' };
const conflict = { description: 'Invalid state, business invariant, or idempotency hash conflict' };
const bankSecurity = [{ bankBearer: [] }];
const operationBody = {
  required: true,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/BankOperationRequest' } },
  },
};
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'CrediFlow API',
    version: '0.1.0',
    description:
      'Fictional financial simulation only. Monetary amounts are integer whole AMD and serialized as strings. This specification covers the public portal action envelope and versioned bank contracts.',
  },
  components: {
    securitySchemes: {
      bankBearer: { type: 'http', scheme: 'bearer' },
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
        description: 'Production uses the secure-prefixed cookie managed by Better Auth.',
      },
    },
    schemas: {
      BankOperationRequest: {
        type: 'object',
        required: ['id', 'accountId', 'kind', 'amount'],
        properties: {
          id: {
            type: 'string',
            maxLength: 160,
            description: 'Stable idempotent economic operation ID',
          },
          accountId: { type: 'string' },
          kind: { enum: ['RESERVE', 'PAYMENT', 'RELEASE'] },
          amount: { type: 'string', pattern: '^[0-9]{1,13}$' },
          purchaseId: { type: 'string' },
          reservationId: { type: 'string' },
        },
      },
      Action: {
        oneOf: [
          {
            type: 'object',
            required: ['action', 'productId', 'quantity'],
            properties: {
              action: { const: 'SET_CART_ITEM' },
              productId: { type: 'string' },
              quantity: { type: 'integer', minimum: 0, maximum: 10 },
            },
          },
          { type: 'object', required: ['action'], properties: { action: { const: 'LINK_BANK' } } },
          {
            type: 'object',
            required: ['action', 'key', 'count', 'items'],
            properties: {
              action: { const: 'CHECKOUT' },
              key: { type: 'string', format: 'uuid' },
              count: { enum: [4, 6] },
              items: {
                type: 'array',
                minItems: 1,
                maxItems: 20,
                items: {
                  type: 'object',
                  required: ['productId', 'quantity'],
                  properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'integer', minimum: 1, maximum: 10 },
                  },
                },
              },
            },
          },
          {
            type: 'object',
            required: ['action', 'installmentId', 'key'],
            properties: {
              action: { const: 'PAY' },
              installmentId: { type: 'string' },
              key: { type: 'string', format: 'uuid' },
            },
          },
          {
            type: 'object',
            required: ['action', 'id'],
            properties: {
              action: { enum: ['CHECK_CREDIT', 'RETRY_JOB', 'REPLAY_WEBHOOK', 'TEST_BANK'] },
              id: { type: 'string' },
            },
          },
          {
            type: 'object',
            required: ['action', 'id', 'approve', 'reason'],
            properties: {
              action: { const: 'DECIDE' },
              id: { type: 'string' },
              approve: { type: 'boolean' },
              reason: { type: 'string', minLength: 4 },
            },
          },
          {
            type: 'object',
            required: ['action'],
            properties: { action: { enum: ['RECONCILE', 'RESET_SIMULATOR'] } },
          },
          {
            type: 'object',
            required: ['action', 'id', 'accountId', 'cash', 'creditLimit', 'status', 'reason'],
            properties: {
              action: { const: 'ADJUST_ACCOUNT' },
              id: { type: 'string' },
              accountId: { type: 'string' },
              cash: { type: 'string', pattern: '^[0-9]{1,13}$' },
              creditLimit: { type: 'string', pattern: '^[0-9]{1,13}$' },
              status: { enum: ['ACTIVE', 'FROZEN'] },
              reason: { type: 'string', minLength: 4 },
            },
          },
          {
            type: 'object',
            required: ['action', 'config', 'nextScenario'],
            properties: {
              action: { const: 'SAVE_SIMULATOR' },
              config: {
                type: 'object',
                description: 'Validated simulatorSchema; see simulator documentation',
              },
              nextScenario: { type: ['string', 'null'] },
            },
          },
        ],
      },
      Webhook: {
        type: 'object',
        required: [
          'eventId',
          'operationId',
          'type',
          'schemaVersion',
          'accountId',
          'amount',
          'currency',
          'status',
          'version',
          'timestamp',
        ],
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          operationId: { type: 'string' },
          type: { type: 'string' },
          schemaVersion: { const: 1 },
          accountId: { type: 'string' },
          amount: { type: 'string', pattern: '^[0-9]+$' },
          currency: { const: 'AMD' },
          status: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Database connectivity health',
        responses: { '200': success, '503': { description: 'Database unavailable' } },
      },
    },
    '/api/portal': {
      get: {
        summary: 'Role- and ownership-filtered portal state',
        security: [{ session: [] }],
        responses: { '200': success, '401': unauthorized },
      },
    },
    '/api/actions': {
      post: {
        summary: 'Validated browser actions; role authorization per action',
        description:
          'Requires Origin matching APP_URL and a valid session. CUSTOMER: LINK_BANK, CHECKOUT, PAY. BNPL_ADMIN: CHECK_CREDIT, DECIDE, RECONCILE, RETRY_JOB. BANK_ADMIN: ADJUST_ACCOUNT, SAVE_SIMULATOR, RESET_SIMULATOR, REPLAY_WEBHOOK, TEST_BANK.',
        security: [{ session: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Action' } } },
        },
        responses: {
          '200': success,
          '400': { description: 'Validation error' },
          '401': unauthorized,
          '403': unauthorized,
          '409': conflict,
          '413': { description: 'Payload too large' },
        },
      },
    },
    '/api/bank/v1/accounts/{id}': {
      get: {
        summary: 'Authoritative balance and credit snapshot',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          '200': success,
          '401': unauthorized,
          '503': { description: 'Injected pre-commit failure' },
          '504': { description: 'Injected timeout' },
        },
      },
    },
    '/api/bank/v1/accounts/{id}/balance': {
      get: {
        summary: 'Cash balance snapshot (same account response)',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': success },
      },
    },
    '/api/bank/v1/accounts/{id}/credit': {
      get: {
        summary: 'Credit snapshot (same account response)',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': success },
      },
    },
    '/api/bank/v1/accounts': {
      post: {
        summary:
          'Idempotently create a zero-balance fictional account for a trusted customer identity',
        security: bankSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customerId', 'name'],
                properties: { customerId: { type: 'string' }, name: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': success, '401': unauthorized },
      },
    },
    '/api/bank/v1/credit/reservations': {
      post: {
        summary: 'Atomic reserve or release operation',
        security: bankSecurity,
        requestBody: operationBody,
        responses: {
          '200': success,
          '409': conflict,
          '504': { description: 'Outcome uncertain: inquire using the original ID' },
        },
      },
    },
    '/api/bank/v1/credit/reservations/{id}': {
      get: {
        summary: 'Authoritative reservation status',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': success },
      },
    },
    '/api/bank/v1/credit/reservations/{id}/commit': {
      post: {
        summary: 'Atomically collect first payment and commit remaining financed principal',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'amount'],
                properties: {
                  id: { type: 'string' },
                  amount: { type: 'string', pattern: '^[0-9]+$' },
                },
              },
            },
          },
        },
        responses: { '200': success, '409': conflict },
      },
    },
    '/api/bank/v1/credit/reservations/{id}/release': {
      post: {
        summary: 'Release an unused reservation',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
            },
          },
        },
        responses: { '200': success, '409': conflict },
      },
    },
    '/api/bank/v1/payments': {
      post: {
        summary: 'Idempotent first payment or principal repayment',
        security: bankSecurity,
        requestBody: operationBody,
        responses: {
          '200': success,
          '409': conflict,
          '504': { description: 'Keep the original intent; query its operation outcome' },
        },
      },
    },
    '/api/bank/v1/payments/{id}': {
      get: {
        summary: 'Payment operation status',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': success },
      },
    },
    '/api/bank/v1/operations/{id}': {
      get: {
        summary: 'Immutable authoritative outcome or null if not committed',
        security: bankSecurity,
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { '200': success },
      },
    },
    '/api/webhooks/bank': {
      post: {
        summary: 'Signed durable webhook receipt',
        parameters: [
          { in: 'header', name: 'x-bank-timestamp', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'x-bank-signature', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Webhook' } } },
        },
        responses: {
          '200': { description: 'Durable receipt; duplicate count retained' },
          '401': { description: 'Invalid signature or timestamp' },
          '409': { description: 'Conflicting event-ID reuse' },
        },
      },
    },
  },
};
