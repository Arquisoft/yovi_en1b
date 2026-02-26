import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

vi.mock('mongoose', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        connect: vi.fn(),
    }
})

import app from '../users-service.js'

let mongoServer;

describe('POST /createuser', () => {

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        const mongooseActual = await import('mongoose').then(m => m.default || m);

        await mongooseActual.disconnect();
        await mongooseActual.connect(mongoUri);
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        if (mongoServer) {
            await mongoServer.stop();
        }
    }, 60000);

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns a greeting message for the provided username', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('message')
        expect(res.body.message).toMatch(/Hello Pablo! Welcome to the course!/i)

        expect(res.body).toHaveProperty('user')
        expect(res.body.user.username).toBe('Pablo')
        expect(res.body.user).toHaveProperty('createdAt')
    })
})