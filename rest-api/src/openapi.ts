export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Digital Twin REST API',
    version: '1.0.0',
    description: 'External API for Digital Twin state, history, and decisions.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: {},
        },
        required: ['error'],
      },
      RawReading: {
        type: 'object',
        properties: {
          ts: { type: 'string', format: 'date-time' },
          series_id: { type: 'string' },
          area: { type: 'string' },
          customer: { type: 'string' },
          price: { type: 'number' },
          payload: { type: 'object' },
        },
        required: ['ts', 'series_id', 'area', 'customer', 'price', 'payload'],
      },
      Decision: {
        type: 'object',
        properties: {
          ts: { type: 'string', format: 'date-time' },
          series_id: { type: 'string' },
          action_type: { type: 'string' },
          current_price: { type: 'number' },
          threshold: { type: 'number' },
          predicted_values: { type: 'array', items: { type: 'number' } },
          predicted_spike: { type: 'boolean' },
          confidence_score: { type: 'number' },
          explanation: { type: 'string' },
        },
        required: [
          'ts',
          'series_id',
          'action_type',
          'current_price',
          'threshold',
          'predicted_values',
          'predicted_spike',
          'confidence_score',
          'explanation',
        ],
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          db_status: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['status', 'db_status', 'timestamp'],
      },
      MetaResponse: {
        type: 'object',
        properties: {
          service: { type: 'string' },
          version: { type: 'string' },
          environment: { type: 'string' },
          timescale_enabled: { type: 'boolean' },
          max_history_limit: { type: 'number' },
          cors_origins: { type: 'array', items: { type: 'string' } },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: [
          'service',
          'version',
          'environment',
          'timescale_enabled',
          'max_history_limit',
          'cors_origins',
          'timestamp',
        ],
      },
      AreaLatestEntry: {
        type: 'object',
        properties: {
          series_id: { type: 'string' },
          latest_reading: { $ref: '#/components/schemas/RawReading' },
          latest_decision: { $ref: '#/components/schemas/Decision', nullable: true },
        },
        required: ['series_id', 'latest_reading', 'latest_decision'],
      },
      AreaLatestResponse: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          count: { type: 'integer' },
          data: { type: 'array', items: { $ref: '#/components/schemas/AreaLatestEntry' } },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['area', 'count', 'data', 'timestamp'],
      },
      AreasResponse: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          areas: { type: 'array', items: { type: 'string' } },
          timestamp: { type: 'string', format: 'date-time' },
        },
        required: ['count', 'areas', 'timestamp'],
      },
      PredictResponse: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          predicted_price: { type: 'number' },
          confidence: { type: 'number' },
          trend: { type: 'string' },
          change_pct: { type: 'number' },
          volatility: { type: 'number' },
          explanation: { type: 'string' },
          recommendation: { type: 'object' },
          data_points_used: { type: 'integer' },
          horizon_minutes: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' },
          redis_connected: { type: 'boolean' },
          prediction_quality: { type: 'string' },
        },
      },
      SpotPricePredictionResponse: {
        type: 'object',
        properties: {
          predicted_price_next_60min: { type: 'number' },
          confidence: { type: 'number' },
          trend: { type: 'string' },
          change_pct: { type: 'number' },
          volatility: { type: 'number' },
          explanation: { type: 'string' },
          recommendation: { type: 'object' },
          metadata: { type: 'object' },
        },
      },
      PredictionInputRecord: {
        type: 'object',
        properties: {
          DateTime: { type: 'string', format: 'date-time' },
          price: { type: 'number' },
          AREA: { type: 'string' },
        },
        required: ['DateTime', 'price'],
      },
      PredictRequest: {
        type: 'object',
        properties: {
          AREA: { type: 'string' },
          series_id: { type: 'string' },
          records: { type: 'array', items: { $ref: '#/components/schemas/PredictionInputRecord' } },
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          limit: { type: 'integer' },
          include_context: { type: 'boolean' },
        },
      },
      SpotPricePredictRequest: {
        type: 'object',
        properties: {
          AREA: { type: 'string' },
          series_id: { type: 'string' },
          records: { type: 'array', items: { $ref: '#/components/schemas/PredictionInputRecord' } },
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          limit: { type: 'integer' },
          include_context: { type: 'boolean' },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/health': {
      get: {
        summary: 'Readiness + DB connectivity',
        security: [],
        responses: {
          '200': {
            description: 'Healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
          '503': {
            description: 'DB unavailable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/meta': {
      get: {
        summary: 'Service metadata',
        responses: {
          '200': {
            description: 'Metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MetaResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/state/latest': {
      get: {
        summary: 'Latest reading + decision for a series',
        parameters: [
          {
            name: 'series_id',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Latest state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    series_id: { type: 'string' },
                    latest_reading: { $ref: '#/components/schemas/RawReading' },
                    latest_decision: { $ref: '#/components/schemas/Decision' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                  required: ['series_id', 'latest_reading', 'latest_decision', 'timestamp'],
                },
              },
            },
          },
          '404': {
            description: 'No data found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/areas': {
      get: {
        summary: 'List available areas',
        responses: {
          '200': {
            description: 'Areas',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AreasResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/area/latest': {
      get: {
        summary: 'Latest readings for all meters in an area',
        parameters: [
          { name: 'area', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: {
          '200': {
            description: 'Latest readings for area',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AreaLatestResponse' },
              },
            },
          },
          '404': {
            description: 'No data found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/state/history': {
      get: {
        summary: 'Historical readings for a series',
        parameters: [
          { name: 'series_id', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'start', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'end', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: {
          '200': {
            description: 'Historical readings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    series_id: { type: 'string' },
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' },
                    limit: { type: 'integer' },
                    count: { type: 'integer' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/RawReading' } },
                  },
                  required: ['series_id', 'start', 'end', 'limit', 'count', 'data'],
                },
              },
            },
          },
        },
      },
    },
    '/v1/decisions/history': {
      get: {
        summary: 'Historical decisions for a series',
        parameters: [
          { name: 'series_id', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'start', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'end', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: {
          '200': {
            description: 'Historical decisions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    series_id: { type: 'string' },
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' },
                    limit: { type: 'integer' },
                    count: { type: 'integer' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Decision' } },
                  },
                  required: ['series_id', 'start', 'end', 'limit', 'count', 'data'],
                },
              },
            },
          },
        },
      },
    },
    '/v1/predict': {
      post: {
        summary: 'Proxy prediction request to algorithm-processor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PredictRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Prediction result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PredictResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/predict/spot-price': {
      post: {
        summary: 'Proxy spot price prediction request to algorithm-processor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SpotPricePredictRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Spot price prediction result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SpotPricePredictionResponse' },
              },
            },
          },
        },
      },
    },
    '/v1/stream/latest': {
      get: {
        summary: 'Get latest stream timestamp',
        description: 'Returns the most recent timestamp and total row count from the ingestion stream.',
        tags: ['stream'],
        responses: {
          '200': {
            description: 'Latest stream stats',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    latest_timestamp: { type: 'string', nullable: true },
                    total_readings: { type: 'integer' },
                    timestamp: { type: 'string' },
                  },
                },
              },
            },
          },
          '503': {
            description: 'TimescaleDB not available',
          },
        },
      },
    },
  },
};
