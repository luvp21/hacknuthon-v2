/**
 * Application Logger
 * Winston-based structured logger with environment-aware formatting.
 * Provides context-aware child loggers for each service module.
 */

import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Pretty format for development console output
const prettyFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss.SSS' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp: ts, service, ...meta }) => {
        const svc = service ? `[${service}]` : '';
        const metaStr =
            Object.keys(meta).length > 0 ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
        return `${ts} ${level} ${svc} ${message}${metaStr}`;
    })
);

// JSON format for production (structured, parseable by log aggregators)
const jsonFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const transports: winston.transport[] = [
    new winston.transports.Console({
        format: env.LOG_FORMAT === 'pretty' ? prettyFormat : jsonFormat,
    }),
];

// Write to file in production
if (env.NODE_ENV === 'production') {
    transports.push(
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: jsonFormat,
            maxsize: 10 * 1024 * 1024,   // 10MB
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: jsonFormat,
            maxsize: 50 * 1024 * 1024,   // 50MB
            maxFiles: 10,
        })
    );
}

export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    defaultMeta: { service: 'voice-ordering' },
    transports,
    exitOnError: false,
});

/**
 * Creates a child logger scoped to a specific service/module.
 * Usage: const log = createServiceLogger('OrderService');
 */
export function createServiceLogger(service: string): winston.Logger {
    return logger.child({ service });
}

// Suppress logs during tests
if (env.NODE_ENV === 'test') {
    logger.silent = true;
}
