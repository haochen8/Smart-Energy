"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openApiSpec = void 0;
exports.openApiSpec = {
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
    },
};
