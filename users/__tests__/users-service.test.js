import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import app from '../users-service.js'

let mongoServer;
let token;
let userId;
let gameId;
let finishedGameId;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
}, 60000);

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── Register ────────────────────────────────────────────────────────────────

describe('POST /createuser', () => {
    it('registers a new user successfully', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo', password: 'password123' })

        expect(res.status).toBe(201)
        expect(res.body.message).toMatch(/Welcome Pablo/i)
        expect(res.body).toHaveProperty('userId')
    })

    it('returns 400 if username or password is missing', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo' })

        expect(res.status).toBe(400)
    })

    it('returns 400 if input is not a string (NoSQL injection prevention)', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: { $gt: '' }, password: 'password123' })

        expect(res.status).toBe(400)
    })

    it('returns 409 if username is already taken', async () => {
        const res = await request(app)
            .post('/createuser')
            .send({ username: 'Pablo', password: 'password123' })

        expect(res.status).toBe(409)
    })
})

// ─── Login ───────────────────────────────────────────────────────────────────

describe('POST /login', () => {
    it('logs in successfully and returns a token', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Pablo', password: 'password123' })

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

        expect(res.status).toBe(400)
    })

    it('returns 400 if input is not a string (NoSQL injection prevention)', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: { $gt: '' }, password: 'password123' })

        expect(res.status).toBe(400)
    })

    it('returns 401 with wrong password', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Pablo', password: 'wrongpassword' })

        expect(res.status).toBe(401)
    })

    it('returns 401 with unknown user', async () => {
        const res = await request(app)
            .post('/login')
            .send({ username: 'Unknown', password: 'password123' })

        expect(res.status).toBe(401)
    })
})

// ─── Username exists ─────────────────────────────────────────────────────────

describe('GET /exists/:username', () => {
    it('returns true for an existing username', async () => {
        const res = await request(app).get('/exists/Pablo')

        expect(res.status).toBe(200)
        expect(res.body.exists).toBe(true)
    })

    it('returns false for a non-existing username', async () => {
        const res = await request(app).get('/exists/NoExiste')

        expect(res.status).toBe(200)
        expect(res.body.exists).toBe(false)
    })
})

// ─── Leaderboard ─────────────────────────────────────────────────────────────

describe('GET /leaderboard', () => {
    it('returns leaderboard without auth', async () => {
        const res = await request(app).get('/leaderboard')

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('overall')
        expect(res.body).toHaveProperty('vs_bots')
    })

    it('overall is an array of at most 10 players', async () => {
        const res = await request(app).get('/leaderboard')

        expect(Array.isArray(res.body.overall)).toBe(true)
        expect(res.body.overall.length).toBeLessThanOrEqual(10)
    })

    it('overall players have username, total_wins and total_games', async () => {
        const res = await request(app).get('/leaderboard')

        if (res.body.overall.length > 0) {
            expect(res.body.overall[0]).toHaveProperty('username')
            expect(res.body.overall[0]).toHaveProperty('total_wins')
            expect(res.body.overall[0]).toHaveProperty('total_games')
        }
    })

    it('overall is ordered by total_wins descending', async () => {
        const res = await request(app).get('/leaderboard')

        for (let i = 0; i < res.body.overall.length - 1; i++) {
            expect(res.body.overall[i].total_wins).toBeGreaterThanOrEqual(
                res.body.overall[i + 1].total_wins
            )
        }
    })

    it('vs_bots has random, defensive, Monte Carlo and ai arrays', async () => {
        const res = await request(app).get('/leaderboard')

        expect(Array.isArray(res.body.vs_bots.random)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.defensive)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.mcts)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.ai)).toBe(true)
    })

    it('vs_bots entries have username and wins', async () => {
        const res = await request(app).get('/leaderboard')

        for (const botKey of ['random', 'defensive', 'mcts', 'ai']) {
            if (res.body.vs_bots[botKey].length > 0) {
                expect(res.body.vs_bots[botKey][0]).toHaveProperty('username')
                expect(res.body.vs_bots[botKey][0]).toHaveProperty('wins')
            }
        }
    })

    it('does not crash when a user has no bot games (vs_bot undefined fix)', async () => {
        // Register a fresh user who has never played a bot game
        await request(app)
            .post('/createuser')
            .send({ username: 'BotlessUser', password: 'password123' })

        // Leaderboard must still return 200 without throwing
        // "Cannot read properties of undefined (reading 'vs_bot')"
        const res = await request(app).get('/leaderboard')

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.overall)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.random)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.defensive)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.mcts)).toBe(true)
        expect(Array.isArray(res.body.vs_bots.ai)).toBe(true)

        // wins field must always be a number, never undefined
        for (const botKey of ['random', 'defensive', 'mcts', 'ai']) {
            res.body.vs_bots[botKey].forEach(entry => {
                expect(typeof entry.wins).toBe('number')
            })
        }
    })

    it('returns 500 when the repository throws', async () => {
        const User = mongoose.model('User')
        vi.spyOn(User, 'find').mockRejectedValueOnce(new Error('DB failure'))

        const res = await request(app).get('/leaderboard')

        expect(res.status).toBe(500)
        expect(res.body).toHaveProperty('error')
    })
})

// ─── User profile ─────────────────────────────────────────────────────────────

describe('GET /users/:id', () => {
    it('returns full user object with _id, username, created_at, statistics and games', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)

        // Top-level user fields
        expect(res.body).toHaveProperty('_id')
        expect(res.body).toHaveProperty('username')
        expect(res.body).toHaveProperty('created_at')
        expect(res.body).not.toHaveProperty('password_hash')

        // Games array included
        expect(Array.isArray(res.body.games)).toBe(true)

        // Stats are nested under statistics, NOT at root level
        expect(res.body).not.toHaveProperty('total_games')
        expect(res.body).not.toHaveProperty('total_wins')
        expect(res.body).toHaveProperty('statistics')

        const { statistics } = res.body
        expect(typeof statistics.total_games).toBe('number')
        expect(typeof statistics.total_wins).toBe('number')
        expect(typeof statistics.total_losses).toBe('number')
        expect(typeof statistics.total_draws).toBe('number')
        expect(Array.isArray(statistics.vs_bots)).toBe(true)
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

    it('includes vs_player stats with wins, losses and draws', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        const { vs_player } = res.body.statistics
        expect(vs_player).toBeDefined()
        expect(typeof vs_player.wins).toBe('number')
        expect(typeof vs_player.losses).toBe('number')
        expect(typeof vs_player.draws).toBe('number')
    })

    it('returns 500 when repository throws', async () => {
        const User = mongoose.model('User')
        vi.spyOn(User, 'findById').mockRejectedValueOnce(new Error('DB failure'))

        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(500)
        expect(res.body).toHaveProperty('error')
    })
})

// ─── User history ─────────────────────────────────────────────────────────────

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

// ─── Create game ──────────────────────────────────────────────────────────────

describe('POST /games', () => {
    it('creates a new BOT game', async () => {
        const res = await request(app)
            .post('/games')
            .send({ board_size: 7, strategy: 'random', game_type: 'BOT' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty('_id')
        expect(res.body.board_size).toBe(7)
        expect(res.body.game_type).toBe('BOT')
        expect(res.body.status).toBe('IN_PROGRESS')
        expect(res.body.result).toBeNull()
        expect(['B', 'R']).toContain(res.body.current_turn)

        gameId = res.body._id
    })

    it('creates a PLAYER game with name_of_enemy', async () => {
        const res = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.game_type).toBe('PLAYER')
        expect(res.body.name_of_enemy).toBe('Tobias')
    })

    it('returns 400 if PLAYER game has no name_of_enemy', async () => {
        const res = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
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

// ─── Get game ─────────────────────────────────────────────────────────────────

describe('GET /games/:id', () => {
    it('returns game state', async () => {
        const res = await request(app)
            .get(`/games/${gameId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body._id).toBe(gameId)
        expect(res.body.status).toBe('IN_PROGRESS')
        expect(res.body).toHaveProperty('moves')
        expect(res.body).toHaveProperty('current_turn')
    })

    it('returns 404 for non-existent game', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/games/${fakeId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})

// ─── Submit move ──────────────────────────────────────────────────────────────

describe('POST /games/:id/move', () => {
    it('saves a move and returns updated game state with switched turn', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: null })
        }))

        const gameRes = await request(app)
            .get(`/games/${gameId}`)
            .set('Authorization', `Bearer ${token}`)
        const firstTurn = gameRes.body.current_turn
        const nextTurn = firstTurn === 'B' ? 'R' : 'B'

        const res = await request(app)
            .post(`/games/${gameId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.moves.length).toBe(1)
        expect(res.body.moves[0].player).toBe(firstTurn)
        expect(res.body.moves[0].yen_state).toBe('B/.B/RB./B..R')
        expect(res.body.current_turn).toBe(nextTurn)
        expect(res.body.status).toBe('IN_PROGRESS')
    })

    it('auto-finishes game with WIN when player B makes the winning move', async () => {
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 5 })
            .set('Authorization', `Bearer ${token}`)
        const winGameId = createRes.body._id

        if (createRes.body.current_turn === 'R') {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ yen_state: '...', winner: null }) }))
            await request(app).post(`/games/${winGameId}/move`).send({ coordinates: { x: 0, y: 0, z: 0 } }).set('Authorization', `Bearer ${token}`)
        }

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: 'B' })
        }))

        const res = await request(app)
            .post(`/games/${winGameId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.status).toBe('FINISHED')
        expect(res.body.result).toBe('WIN')
    })

    it('auto-finishes game with LOSS when player R makes the winning move', async () => {
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 5 })
            .set('Authorization', `Bearer ${token}`)
        const lossGameId = createRes.body._id

        if (createRes.body.current_turn === 'B') {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ yen_state: '...', winner: null }) }))
            await request(app).post(`/games/${lossGameId}/move`).send({ coordinates: { x: 0, y: 0, z: 0 } }).set('Authorization', `Bearer ${token}`)
        }

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: 'R' })
        }))

        const res = await request(app)
            .post(`/games/${lossGameId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.status).toBe('FINISHED')
        expect(res.body.result).toBe('LOSS')
    })

    it('returns 400 if coordinates are missing', async () => {
        const res = await request(app)
            .post(`/games/${gameId}/move`)
            .send({})
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(400)
    })

    it('returns 503 when Gamey compute is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

        const res = await request(app)
            .post(`/games/${gameId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(503)
    })

    it('returns 502 when Gamey compute returns an error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

        const res = await request(app)
            .post(`/games/${gameId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(502)
    })

    it('returns 404 for non-existent game', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: null })
        }))

        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .post(`/games/${fakeId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })
})

// ─── Bot play ─────────────────────────────────────────────────────────────────

describe('GET /games/:id/play', () => {
    it('saves bot move and returns full game state when Gamey responds', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 2, y: 1, z: 0 }, yen_state: 'R/.B/RB./B..R', winner: null })
        }))

        const res = await request(app)
            .get(`/games/${gameId}/play`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body).toHaveProperty('_id')
        expect(res.body).toHaveProperty('moves')
        expect(res.body.status).toBe('IN_PROGRESS')

        const botMove = res.body.moves.at(-1)
        expect(botMove.coordinates).toEqual({ x: 2, y: 1, z: 0 })
        expect(botMove.yen_state).toBe('R/.B/RB./B..R')
    })

    it('auto-finishes game with LOSS when bot wins (winner R)', async () => {
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 5 })
            .set('Authorization', `Bearer ${token}`)
        const botWinGameId = createRes.body._id

        if (createRes.body.current_turn === 'R') {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ yen_state: '...', winner: null }) }))
            await request(app).post(`/games/${botWinGameId}/move`).send({ coordinates: { x: 0, y: 0, z: 0 } }).set('Authorization', `Bearer ${token}`)
        }

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: null })
        }))
        await request(app)
            .post(`/games/${botWinGameId}/move`)
            .send({ coordinates: { x: 0, y: 0, z: 4 } })
            .set('Authorization', `Bearer ${token}`)

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 2, y: 1, z: 0 }, yen_state: 'R/.B/RB./B..R', winner: 'R' })
        }))

        const res = await request(app)
            .get(`/games/${botWinGameId}/play`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(201)
        expect(res.body.status).toBe('FINISHED')
        expect(res.body.result).toBe('LOSS')
    })

    it('returns 503 when Gamey is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

        const res = await request(app)
            .get(`/games/${gameId}/play`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(503)
    })

    it('returns 502 when Gamey returns an error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

        const res = await request(app)
            .get(`/games/${gameId}/play`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(502)
    })

    it('returns 404 for non-existent game', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/games/${fakeId}/play`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })

    it('returns 401 without token', async () => {
        const res = await request(app).get(`/games/${gameId}/play`)
        expect(res.status).toBe(401)
    })
})

// ─── Public play endpoint ─────────────────────────────────────────────────────

const YEN_POSITION = JSON.stringify({ size: 4, turn: 0, players: ['B', 'R'], layout: 'B/.B/RB./B..R' })

describe('GET /play', () => {
    it('returns bot move without auth or game id', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: YEN_POSITION, winner: null })
        }))

        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION, bot_id: 'random', board_size: 7 })

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('coords')
    })

    it('returns 400 if position is missing', async () => {
        const res = await request(app)
            .get('/play')
            .query({ bot_id: 'random' })

        expect(res.status).toBe(400)
    })

    it('returns 400 if position is not valid JSON', async () => {
        const res = await request(app)
            .get('/play')
            .query({ position: 'not-valid-json' })

        expect(res.status).toBe(400)
    })

    it('defaults to mcts bot when no bot_id is provided', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: YEN_POSITION, winner: null })
        })
        vi.stubGlobal('fetch', fetchMock)

        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION })

        expect(res.status).toBe(200)
        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(callBody.strategy).toBe('mcts')  // bot_id maps to strategy
    })

    it('derives board_size from position.size when board_size param is not provided', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: YEN_POSITION, winner: null })
        })
        vi.stubGlobal('fetch', fetchMock)

        // No board_size query param — route must fall back to position.size (4)
        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION })

        expect(res.status).toBe(200)
        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(callBody.board_size).toBe(4)  // falls back to position.size
    })

    it('uses explicit board_size query param over position.size when both are present', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: YEN_POSITION, winner: null })
        })
        vi.stubGlobal('fetch', fetchMock)

        // board_size: 7 should take priority over position.size (4)
        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION, board_size: 7 })

        expect(res.status).toBe(200)
        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(callBody.board_size).toBe(7)
    })

    it('returns 503 when Gamey is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION })

        expect(res.status).toBe(503)
    })

    it('returns 502 when Gamey returns an error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION })

        expect(res.status).toBe(502)
    })

    it('does not require authentication', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: YEN_POSITION, winner: null })
        }))

        const res = await request(app)
            .get('/play')
            .query({ position: YEN_POSITION })

        expect(res.status).toBe(200)
    })
})

// ─── Game options ─────────────────────────────────────────────────────────────

describe('GET /games/options', () => {
    it('returns strategies and variants', async () => {
        const res = await request(app).get('/games/options')

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.strategies)).toBe(true)
        expect(Array.isArray(res.body.variants)).toBe(true)
        expect(res.body).not.toHaveProperty('difficulty_levels')
    })

    it('returns strategies as objects with name and difficulty', async () => {
        const res = await request(app).get('/games/options')

        res.body.strategies.forEach(s => {
            expect(s).toHaveProperty('name')
            expect(s).toHaveProperty('difficulty')
        })
    })

    it('returns the expected strategies with their difficulties', async () => {
        const res = await request(app).get('/games/options')

        const names = res.body.strategies.map(s => s.name)
        expect(names).toContain('Random')
        expect(names).toContain('Defensive')
        expect(names).toContain('Monte Carlo')
        expect(names).toContain('AI (Gemini)')

        const random = res.body.strategies.find(s => s.name === 'Random')
        const defensive = res.body.strategies.find(s => s.name === 'Defensive')
        const mcts = res.body.strategies.find(s => s.name === 'Monte Carlo')
        const ai = res.body.strategies.find(s => s.name === 'AI (Gemini)')
        expect(random.difficulty).toBe('Easy 😄')
        expect(defensive.difficulty).toBe('Medium 😐')
        expect(mcts.difficulty).toBe('Hard 😈')
        expect(ai.difficulty).toBe('Medium 🤖')
    })

    it('returns variants as objects with name, description and allowed_strategies', async () => {
        const res = await request(app).get('/games/options')

        res.body.variants.forEach(v => {
            expect(v).toHaveProperty('name')
            expect(v).toHaveProperty('description')
            expect(v).toHaveProperty('allowed_strategies')
        })
    })

    it('returns the expected variants', async () => {
        const res = await request(app).get('/games/options')

        const names = res.body.variants.map(v => v.name)
        expect(names).toContain('Explosions')
        expect(names).not.toContain('Classic Y')
    })

    it('does not require authentication', async () => {
        const res = await request(app).get('/games/options')
        expect(res.status).toBe(200)
    })
})

// ─── Undo move ────────────────────────────────────────────────────────────────

describe('POST /games/:id/undo', () => {
    let botGameId;

    beforeAll(async () => {
        const botRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'BOT' })
            .set('Authorization', `Bearer ${token}`)
        botGameId = botRes.body._id
    })

    it('removes the last move and switches turn back', async () => {
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)
        const freshGameId = createRes.body._id

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: null })
        })
        await request(app)
            .post(`/games/${freshGameId}/move`)
            .send({ coordinates: { x: 1, y: 1, z: 1 } })
            .set('Authorization', `Bearer ${token}`)
        fetchSpy.mockRestore()

        const beforeRes = await request(app)
            .get(`/games/${freshGameId}`)
            .set('Authorization', `Bearer ${token}`)
        const movesBefore = beforeRes.body.moves.length
        const turnBefore = beforeRes.body.current_turn

        const res = await request(app)
            .post(`/games/${freshGameId}/undo`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.moves.length).toBe(movesBefore - 1)
        expect(res.body.current_turn).not.toBe(turnBefore)
    })

    it('returns 400 when there are no moves to undo', async () => {
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)
        const emptyGameId = createRes.body._id

        const res = await request(app)
            .post(`/games/${emptyGameId}/undo`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
        expect(res.body.error).toMatch(/no moves/i)
    })

    it('returns 400 for BOT games', async () => {
        const res = await request(app)
            .post(`/games/${botGameId}/undo`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
        expect(res.body.error).toMatch(/player vs player/i)
    })

    it('returns 400 for a finished game', async () => {
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)
        const finishedId = createRes.body._id

        await request(app)
            .put(`/games/${finishedId}/finish`)
            .send({ result: 'UNFINISHED' })
            .set('Authorization', `Bearer ${token}`)

        const res = await request(app)
            .post(`/games/${finishedId}/undo`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
        expect(res.body.error).toMatch(/finished/i)
    })

    it('returns 404 for a non-existent game', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .post(`/games/${fakeId}/undo`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(404)
    })

    it('returns 401 without token', async () => {
        const res = await request(app).post(`/games/${botGameId}/undo`)
        expect(res.status).toBe(401)
    })
})

// ─── Finish game ──────────────────────────────────────────────────────────────

describe('PUT /games/:id/finish', () => {
    it('finishes a game with WIN and updates user stats', async () => {
        const res = await request(app)
            .put(`/games/${gameId}/finish`)
            .send({ result: 'WIN', yen_final_state: 'B/.B/RB./B..R', duration_seconds: 120 })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.status).toBe('FINISHED')
        expect(res.body.result).toBe('WIN')

        finishedGameId = gameId
    })

    it('updates user stats after WIN', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)

        const { statistics } = res.body
        expect(statistics.total_games).toBeGreaterThanOrEqual(1)
        expect(statistics.total_wins).toBeGreaterThanOrEqual(1)
        expect(typeof statistics.total_losses).toBe('number')

        // vs_bots is now a normalized array under statistics
        expect(Array.isArray(statistics.vs_bots)).toBe(true)
        const random = statistics.vs_bots.find(b => b.name === 'Random')
        expect(random).toBeDefined()
        expect(random.difficulty).toBe('Easy 😄')
        expect(random.wins).toBeGreaterThanOrEqual(1)
        expect(typeof random.losses).toBe('number')
    })

    it('vs_bots array contains all four bots with correct shape', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)

        const BOT_DIFFICULTY = {
            random:    'Easy 😄',
            defensive: 'Medium 😐',
            mcts:      'Hard 😈',
            ai:        'Medium 🤖'
        }

        // Cambiado a STRATEGY_DISPLAY_NAMES para que coincida con el bucle de abajo
        // Y corregido "AI" en mayúsculas
        const STRATEGY_DISPLAY_NAMES = {
            random:        'Random',
            defensive:     'Defensive',
            mcts:          'Monte Carlo',
            ai:            'AI (Gemini)'
        };

        // Ahora STRATEGY_DISPLAY_NAMES ya existe
        for (const strategyKey of Object.keys(STRATEGY_DISPLAY_NAMES)) {
            const name = STRATEGY_DISPLAY_NAMES[strategyKey];
            const difficulty = BOT_DIFFICULTY[strategyKey];

            const entry = res.body.statistics.vs_bots.find(b => b.name === name);

            expect(entry).toBeDefined();
            expect(entry.difficulty).toBe(difficulty);
            expect(typeof entry.wins).toBe('number');
            expect(typeof entry.losses).toBe('number');
            expect(typeof entry.draws).toBe('number');
        }
    })

    it('does NOT update stats when result is UNFINISHED (user quit)', async () => {
        const statsBefore = (await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)).body.statistics

        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7 })
            .set('Authorization', `Bearer ${token}`)
        await request(app)
            .put(`/games/${createRes.body._id}/finish`)
            .send({ result: 'UNFINISHED' })
            .set('Authorization', `Bearer ${token}`)

        const statsAfter = (await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)).body.statistics

        expect(statsAfter.total_wins).toBe(statsBefore.total_wins)
        expect(statsAfter.total_losses).toBe(statsBefore.total_losses)
    })

    it('returns 400 if result is missing', async () => {
        const res = await request(app)
            .put(`/games/${finishedGameId}/finish`)
            .send({})
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('returns 400 if game is already finished', async () => {
        const res = await request(app)
            .put(`/games/${finishedGameId}/finish`)
            .send({ result: 'WIN' })
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(400)
    })

    it('updates vs_player stats when finishing a PLAYER game with WIN', async () => {
        const statsBefore = (await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)).body.statistics

        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)
        const playerGameId = createRes.body._id

        await request(app)
            .put(`/games/${playerGameId}/finish`)
            .send({ result: 'WIN' })
            .set('Authorization', `Bearer ${token}`)

        const statsAfter = (await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)).body.statistics

        // Covers the `if (type === 'PLAYER')` branch in updateStats
        expect(statsAfter.vs_player.wins).toBe(statsBefore.vs_player.wins + 1)
        expect(statsAfter.total_wins).toBe(statsBefore.total_wins + 1)
        expect(statsAfter.total_games).toBe(statsBefore.total_games + 1)
    })

    it('updates vs_player stats when finishing a PLAYER game with LOSS', async () => {
        const statsBefore = (await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)).body.statistics

        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)

        await request(app)
            .put(`/games/${createRes.body._id}/finish`)
            .send({ result: 'LOSS' })
            .set('Authorization', `Bearer ${token}`)

        const statsAfter = (await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)).body.statistics

        expect(statsAfter.vs_player.losses).toBe(statsBefore.vs_player.losses + 1)
        expect(statsAfter.total_losses).toBe(statsBefore.total_losses + 1)
    })
})

// ─── Replay ───────────────────────────────────────────────────────────────────

describe('GET /games/:id/moves', () => {
    it('returns all moves ordered by move_number', async () => {
        const res = await request(app)
            .get(`/games/${finishedGameId}/moves`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBeGreaterThan(0)
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

// ─── User history (after games played) ───────────────────────────────────────

describe('GET /users/:id/history (after games)', () => {
    it('returns game history with games played', async () => {
        const res = await request(app)
            .get(`/users/${userId}/history`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBeGreaterThan(0)
        res.body.forEach(game => {
            expect(game).not.toHaveProperty('moves')
        })
    })
})

// ─── GET /users/:id includes games ───────────────────────────────────────────

describe('GET /users/:id games array', () => {
    it('includes a games array in the user profile after games are played', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.games)).toBe(true)
        expect(res.body.games.length).toBeGreaterThan(0)
    })

    it('games in the profile do not expose move arrays (select -moves)', async () => {
        const res = await request(app)
            .get(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)

        res.body.games.forEach(game => {
            expect(game).not.toHaveProperty('moves')
        })
    })

    it('games array is empty for a brand new user', async () => {
        // Register and log in a fresh user
        await request(app)
            .post('/createuser')
            .send({ username: 'FreshUser', password: 'password123' })
        const loginRes = await request(app)
            .post('/login')
            .send({ username: 'FreshUser', password: 'password123' })
        const freshToken = loginRes.body.token
        const freshId    = loginRes.body.userId

        const res = await request(app)
            .get(`/users/${freshId}`)
            .set('Authorization', `Bearer ${freshToken}`)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.games)).toBe(true)
        expect(res.body.games.length).toBe(0)
    })
})

// ─── MongoUserRepository direct unit tests ───────────────────────────────────

describe('MongoUserRepository direct unit tests', () => {
    let repo
    let User
    let Game

    beforeAll(async () => {
        const { default: MongoUserRepository } = await import('../repository/MongoUserRepository.js')
        repo = new MongoUserRepository()
        User = mongoose.model('User')
        Game = mongoose.model('Game')
    })

    // ── findById ──────────────────────────────────────────────────────────────

    it('findById returns user without password_hash', async () => {
        const created = await User.create({ username: 'RepoTestUser', password_hash: 'secret' })
        const found = await repo.findById(created._id)
        expect(found).not.toBeNull()
        expect(found.username).toBe('RepoTestUser')
        expect(found.password_hash).toBeUndefined()
    })

    // ── create ────────────────────────────────────────────────────────────────

    it('create saves a new user and returns it', async () => {
        const saved = await repo.create({ username: 'RepoCreatedUser', password_hash: 'hash' })
        expect(saved._id).toBeDefined()
        expect(saved.username).toBe('RepoCreatedUser')
    })

    // ── createGame / findGameById / updateGame ────────────────────────────────

    it('createGame saves a game and findGameById retrieves it', async () => {
        const user = await User.create({ username: 'GameRepoUser', password_hash: 'x' })
        const game = await repo.createGame({
            player_id:    user._id,
            board_size:   7,
            game_type:    'BOT',
            strategy:     'random',
            current_turn: 'B',
            status:       'IN_PROGRESS',
        })
        expect(game._id).toBeDefined()

        const found = await repo.findGameById(game._id)
        expect(found).not.toBeNull()
        expect(String(found._id)).toBe(String(game._id))
    })

    it('updateGame updates and returns the new document', async () => {
        const user = await User.create({ username: 'UpdateGameUser', password_hash: 'x' })
        const game = await repo.createGame({
            player_id:    user._id,
            board_size:   7,
            game_type:    'BOT',
            strategy:     'random',
            current_turn: 'B',
            status:       'IN_PROGRESS',
        })

        const updated = await repo.updateGame(game._id, { $set: { status: 'FINISHED', result: 'WIN' } })
        expect(updated.status).toBe('FINISHED')
        expect(updated.result).toBe('WIN')
    })

    // ── updateStats: draws branch (covers vs_bot draws + findByIdAndUpdate) ──

    it('updateStats increments draws for a BOT game (covers drawIncr and findByIdAndUpdate)', async () => {
        const user = await User.create({ username: 'DrawStatsUser', password_hash: 'x' })
        await repo.updateStats(user._id, { result: 'DRAW', type: 'BOT', strategy: 'mcts' })

        const updated = await repo.findById(user._id)
        expect(updated.statistics.total_draws).toBe(1)
        expect(updated.statistics.vs_bot.mcts.draws).toBe(1)
        // wins and losses stay 0
        expect(updated.statistics.total_wins).toBe(0)
        expect(updated.statistics.total_losses).toBe(0)
    })

    // ── getLeaderboard ?? 0 fallback: user appears in ALL three bot queries ──

    it('getLeaderboard returns wins: 0 for users with no vs_bot data in every bot category', async () => {
        // Give this user high bot wins in each category so they appear in the
        // sorted-by-wins queries, but then wipe vs_bot via a raw update so
        // lean() returns undefined — forcing all three ?? 0 branches to execute.
        const user = await User.create({
            username: 'NoBotDataUser',
            password_hash: 'x',
            statistics: {
                total_games:  3,
                total_wins:   50,
                total_losses: 0,
                total_draws:  0,
                vs_bot: {
                    random:    { wins: 50, losses: 0, draws: 0 },
                    defensive: { wins: 50, losses: 0, draws: 0 },
                    mcts:      { wins: 50, losses: 0, draws: 0 },
                    ai:        { wins: 50, losses: 0, draws: 0 },
                }
            }
        })

        // Unset vs_bot so lean() returns it as undefined
        await User.updateOne({ _id: user._id }, { $unset: { 'statistics.vs_bot': '' } })

        const leaderboard = await repo.getLeaderboard()

        for (const botKey of ['random', 'defensive', 'mcts', 'ai']) {
            const entry = leaderboard.vs_bots[botKey].find(e => e.username === 'NoBotDataUser')
            expect(entry).toBeDefined()           // user appears in results
            expect(entry.wins).toBe(0)            // ?? 0 fallback was hit
            expect(typeof entry.wins).toBe('number')
        }
    })

    describe('Strategy and Result Coverage (API Level)', () => {

        it('covers result: LOSS and strategy: undefined (defaults to random)', async () => {
            // Creamos una partida rápida para poder terminarla
            const gameRes = await request(app)
                .post('/games')
                .send({ board_size: 7, strategy: undefined, game_type: 'BOT' })
                .set('Authorization', `Bearer ${token}`);

            const localGameId = gameRes.body._id;

            // Terminamos la partida como LOSS
            // Esto pasará por: result === 'LOSS' ? 1 : 0
            // Y por: strategy || 'random'
            await request(app)
                .put(`/games/${localGameId}/finish`)
                .send({ result: 'LOSS', yen_final_state: '...', duration_seconds: 10 })
                .set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .get(`/users/${userId}`)
                .set('Authorization', `Bearer ${token}`);

            const random = res.body.statistics.vs_bots.find(b => b.name === 'Random');
            expect(random.losses).toBeGreaterThanOrEqual(1);
        });

        it('covers result: DRAW and strategy case-insensitivity', async () => {
            const gameRes = await request(app)
                .post('/games')
                .send({ board_size: 7, strategy: 'MONTE CARLO', game_type: 'BOT' })
                .set('Authorization', `Bearer ${token}`);

            const localGameId = gameRes.body._id;

            // Terminamos como DRAW
            // Esto pasará por: result === 'DRAW' ? 1 : 0
            // Y por: strategy?.toLowerCase() -> 'monte carlo' -> mapeo a 'mcts'
            await request(app)
                .put(`/games/${localGameId}/finish`)
                .send({ result: 'DRAW', yen_final_state: '...', duration_seconds: 10 })
                .set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .get(`/users/${userId}`)
                .set('Authorization', `Bearer ${token}`);

            const mcts = res.body.statistics.vs_bots.find(b => b.name === 'Monte Carlo');
            expect(mcts.draws).toBeGreaterThanOrEqual(1);
        });
    });
})