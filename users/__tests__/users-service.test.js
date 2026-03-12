import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import app from '../users-service.js'

let mongoServer;
let token;
let userId;
let gameId;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
}, 60000);

afterEach(() => {
    vi.restoreAllMocks()
});

// Register
describe('POST /createuser', () => {
    it('registers a new user successfully', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo', password: 'password123' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty('message')
        expect(res.body.message).toMatch(/Welcome Pablo/i)
        expect(res.body).toHaveProperty('userId')
    })

    it('returns 400 if username or password is missing', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(400)
    })

    it('returns 400 if input is not a string (NoSQL injection prevention)', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: { $gt: '' }, password: 'password123' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(400)
    })

    it('returns 409 if username is already taken', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo', password: 'password123' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(409)
    })
})

// Login
describe('POST /login', () => {
    it('logs in successfully and returns a token', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Pablo', password: 'password123' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('token')
        expect(res.body).toHaveProperty('userId')
        expect(res.body.username).toBe('Pablo')

        token = res.body.token
        userId = res.body.userId
    })

    it('returns 400 if username or password is missing', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Pablo' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(400)
    })

    it('returns 400 if input is not a string (NoSQL injection prevention)', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: { $gt: '' }, password: 'password123' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(400)
    })

    it('returns 401 with wrong password', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Pablo', password: 'wrongpassword' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(401)
    })

    it('returns 401 with unknown user', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Unknown', password: 'password123' })
            .set('Accept', 'application/json')

        expect(res.status).toBe(401)
    })
})

// User profile
describe('GET /users/:id', () => {
    it('returns user profile', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.username).toBe('Pablo')
        expect(res.body).not.toHaveProperty('password_hash')
    })

    it('returns 401 without token', async () => {
        const res = await request(app).get(`/users/${userId}`)
        expect(res.status).toBe(401)
    })

    it('returns 401 with invalid token', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', 'Bearer invalidtoken')
        expect(res.status).toBe(401)
    })

    it('returns 404 for non-existent user', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/users/${fakeId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})

// User stats
describe('GET /users/:id/stats', () => {
    it('returns user statistics with correct initial values', async () => {
        const res = await request(app)
            .get(`/users/${userId}/stats`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.games_played).toBe(0)
        expect(res.body.wins).toBe(0)
        expect(res.body.losses).toBe(0)
    })

    it('returns 404 for non-existent user', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/users/${fakeId}/stats`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})

// User history
describe('GET /users/:id/history', () => {
    it('returns empty game history initially', async () => {
        const res = await request(app)
            .get(`/users/${userId}/history`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBe(0)
    })
})

// Games
describe('POST /games', () => {
    it('creates a new game', async () => {
        const res = await request(app)
            .post('/games')
            .send({ board_size: 7, strategy: 'random', difficulty_level: 'medium' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty('_id')
        expect(res.body.board_size).toBe(7)
        expect(res.body.status).toBe('IN_PROGRESS')
        expect(res.body.result).toBeNull()

        gameId = res.body._id
    })

    it('returns 400 if board_size is missing', async () => {
        const res = await request(app)
            .post('/games')
            .send({ strategy: 'random' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('returns 401 without token', async () => {
        const res = await request(app)
            .post('/games')
            .send({ board_size: 7 })
        expect(res.status).toBe(401)
    })
})

// Get game
describe('GET /games/:id', () => {
    it('returns game state', async () => {
        const res = await request(app)
            .get(`/games/${gameId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body._id).toBe(gameId)
        expect(res.body.status).toBe('IN_PROGRESS')
    })

    it('returns 404 for non-existent game', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/games/${fakeId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})

// Moves
describe('POST /games/:id/move', () => {
    it('saves a move', async () => {
        const res = await request(app)
            .post(`/games/${gameId}/move`)
            .send({ player: 'HUMAN', coordinates: { x: 1, y: 1, z: 1 }, yen_state: 'B/.B/RB./B..R' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.move_number).toBe(1)
        expect(res.body.player).toBe('HUMAN')
        expect(res.body.coordinates).toEqual({ x: 1, y: 1, z: 1 })
    })

    it('returns 400 if coordinates are missing', async () => {
        const res = await request(app)
            .post(`/games/${gameId}/move`)
            .send({ player: 'HUMAN' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent game', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .post(`/games/${fakeId}/move`)
            .send({ player: 'HUMAN', coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})

// Finish game
describe('PUT /games/:id/finish', () => {
    it('finishes a game with WIN and updates user stats', async () => {
        const res = await request(app)
            .put(`/games/${gameId}/finish`)
            .send({ result: 'WIN', yen_final_state: 'B/.B/RB./B..R', duration_seconds: 120 })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.status).toBe('FINISHED')
        expect(res.body.result).toBe('WIN')
    })

    it('updates user stats after WIN', async () => {
        const res = await request(app)
            .get(`/users/${userId}/stats`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.body.games_played).toBe(1)
        expect(res.body.wins).toBe(1)
        expect(res.body.losses).toBe(0)
    })

    it('returns 400 if result is missing', async () => {
        const res = await request(app)
            .put(`/games/${gameId}/finish`)
            .send({})
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('returns 400 if game is already finished', async () => {
        const res = await request(app)
            .put(`/games/${gameId}/finish`)
            .send({ result: 'WIN' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })
})

// Replay
describe('GET /games/:id/moves', () => {
    it('returns all moves ordered by move_number', async () => {
        const res = await request(app)
            .get(`/games/${gameId}/moves`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body[0].move_number).toBe(1)
        expect(res.body[0].coordinates).toEqual({ x: 1, y: 1, z: 1 })
    })

    it('returns 404 for non-existent game', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/games/${fakeId}/moves`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})