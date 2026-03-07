/**
 * Demo Routes
 * Public endpoints that power the web-based chat demo.
 * No Twilio, no audio â€” pure text in / text out.
 *
 *  POST /api/demo/start              â€” start session, get greeting (legacy)
 *  POST /api/demo/session            â€” create session with phone (new)
 *  POST /api/demo/chat               â€” send a message, get AI reply + cart
 *  GET  /api/demo/session/:sessionId â€” peek at session state
 *  DELETE /api/demo/session/:sessionId â€” end a session
 *  GET  /api/demo/menu               â€” fetch menu for the demo restaurant
 */

import { FastifyInstance } from 'fastify';
import {
    startDemo,
    chatDemo,
    getSessionDemo,
    createSessionDemo,
    deleteSessionDemo,
    getMenuDemo,
} from '../controllers/demo.controller';

export async function demoRoutes(app: FastifyInstance): Promise<void> {
    /** Start a new demo session (legacy convenience endpoint) */
    app.post('/start', {
        schema: {
            description: 'Start a new demo chat session',
            tags: ['Demo'],
            body: {
                type: 'object',
                properties: {
                    restaurantId: { type: 'string' },
                    language: { type: 'string', enum: ['en', 'hi', 'hinglish'] },
                    phone: { type: 'string' },
                },
            },
        },
    }, startDemo);

    /** Create a session explicitly (POST /session) */
    app.post('/session', {
        schema: {
            description: 'Create a new conversation session',
            tags: ['Demo'],
            body: {
                type: 'object',
                properties: {
                    restaurantId: { type: 'string' },
                    language: { type: 'string', enum: ['en', 'hi', 'hinglish'] },
                    phone: { type: 'string' },
                },
            },
        },
    }, createSessionDemo);

    /** Send a chat message */
    app.post('/chat', {
        schema: {
            description: 'Send a message and get the AI reply',
            tags: ['Demo'],
            body: {
                type: 'object',
                required: ['sessionId', 'message'],
                properties: {
                    sessionId: { type: 'string' },
                    message: { type: 'string' },
                },
            },
        },
    }, chatDemo);

    /** Peek at current session state */
    app.get('/session/:sessionId', {
        schema: {
            description: 'Get current session state',
            tags: ['Demo'],
            params: {
                type: 'object',
                properties: { sessionId: { type: 'string' } },
                required: ['sessionId'],
            },
        },
    }, getSessionDemo);

    /** End / delete a session */
    app.delete('/session/:sessionId', {
        schema: {
            description: 'End a conversation session',
            tags: ['Demo'],
            params: {
                type: 'object',
                properties: { sessionId: { type: 'string' } },
                required: ['sessionId'],
            },
        },
    }, deleteSessionDemo);

    /** Menu listing for the sidebar */
    app.get('/menu', {
        schema: {
            description: 'Get menu items for the demo restaurant',
            tags: ['Demo'],
            querystring: {
                type: 'object',
                properties: { restaurantId: { type: 'string' } },
            },
        },
    }, getMenuDemo);
}


