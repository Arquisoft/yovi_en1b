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
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('returns at most 10 players', async () => {
        const res = await request(app).get('/leaderboard')

        expect(res.status).toBe(200)
        expect(res.body.length).toBeLessThanOrEqual(10)
    })

    it('returns players with username and statistics', async () => {
        const res = await request(app).get('/leaderboard')

        if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('username')
            expect(res.body[0]).toHaveProperty('statistics')
        }
    })

    it('returns players ordered by total_wins descending', async () => {
        const res = await request(app).get('/leaderboard')

        for (let i = 0; i < res.body.length - 1; i++) {
            expect(res.body[i].statistics.total_wins).toBeGreaterThanOrEqual(
                res.body[i + 1].statistics.total_wins
            )
        }
    })
})

// ─── User profile ─────────────────────────────────────────────────────────────

describe('GET /users/:id', () => {
    it('returns user profile without password_hash', async () => {
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

// ─── User stats ───────────────────────────────────────────────────────────────

describe('GET /users/:id/stats', () => {
    it('returns user statistics with correct initial values', async () => {
        const res = await request(app)
            .get(`/users/${userId}/stats`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.total_games).toBe(0)
        expect(res.body.total_wins).toBe(0)
        expect(res.body.total_losses).toBe(0)
        expect(res.body.total_draws).toBe(0)
        expect(res.body).toHaveProperty('vs_player')
        expect(res.body).toHaveProperty('vs_bot')
    })

    it('returns 404 for non-existent user', async () => {
        const fakeId = new mongoose.Types.ObjectId()
        const res = await request(app)
            .get(`/users/${fakeId}/stats`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
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
            .send({ board_size: 7, strategy: 'random', difficulty_level: 'medium', game_type: 'BOT' })
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
        // Create a fresh game for this test
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 5 })
            .set('Authorization', `Bearer ${token}`)
        const winGameId = createRes.body._id

        // Ensure it's B's turn
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

        // Ensure it's R's turn
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

        // Ensure the bot plays as R. So we need the human to play as B!
        // If it comes out as R first, we do a dummy move so the bot is B? No, the Bot MUST play as R.
        // So the second move (bot's move) must be on turn R. This means human move must be on turn B.
        if (createRes.body.current_turn === 'R') {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ yen_state: '...', winner: null }) }))
            await request(app).post(`/games/${botWinGameId}/move`).send({ coordinates: { x: 0, y: 0, z: 0 } }).set('Authorization', `Bearer ${token}`)
        }

        // First add a move so yen_state is available (Human plays on B)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ yen_state: 'B/.B/RB./B..R', winner: null })
        }))
        await request(app)
            .post(`/games/${botWinGameId}/move`)
            .send({ coordinates: { x: 0, y: 0, z: 4 } })
            .set('Authorization', `Bearer ${token}`)

        // Bot plays on R
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

describe('POST /play', () => {
    it('returns bot move without auth or game id', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: 'B/.B/RB./B..R', winner: null })
        }))

        const res = await request(app)
            .post('/play')
            .send({ yen_state: null, strategy: 'random', board_size: 7 })

        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('coordinates')
        expect(res.body).toHaveProperty('yen_state')
    })

    it('returns 400 if board_size is missing', async () => {
        const res = await request(app)
            .post('/play')
            .send({ strategy: 'random' })

        expect(res.status).toBe(400)
    })

    it('returns 503 when Gamey is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

        const res = await request(app)
            .post('/play')
            .send({ board_size: 7 })

        expect(res.status).toBe(503)
    })

    it('returns 502 when Gamey returns an error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

        const res = await request(app)
            .post('/play')
            .send({ board_size: 7 })

        expect(res.status).toBe(502)
    })

    it('does not require authentication', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ coordinates: { x: 1, y: 0, z: 2 }, yen_state: 'B/.B/RB./B..R', winner: null })
        }))

        const res = await request(app)
            .post('/play')
            .send({ board_size: 7 })

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
        expect(names).toContain('AI')
        expect(names).toContain('Dijkstra')

        const random = res.body.strategies.find(s => s.name === 'Random')
        const ai = res.body.strategies.find(s => s.name === 'AI')
        const dijkstra = res.body.strategies.find(s => s.name === 'Dijkstra')
        expect(random.difficulty).toBe('Easy 😄')
        expect(ai.difficulty).toBe('Medium 😐')
        expect(dijkstra.difficulty).toBe('Hard 😈')
    })

    it('returns the expected variants', async () => {
        const res = await request(app).get('/games/options')

        expect(res.body.variants).toContain('Classic Y')
        expect(res.body.variants).toContain('Master Y (coming soon)')
        expect(res.body.variants).toContain('Pie Rule (coming soon)')
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
        // Create fresh PLAYER game
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7, game_type: 'PLAYER', name_of_enemy: 'Tobias' })
            .set('Authorization', `Bearer ${token}`)
        const freshGameId = createRes.body._id

        // Add a move using spyOn so afterEach restoreAllMocks doesn't interfere
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
            .send({ result: 'DRAW' })
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
            .get(`/users/${userId}/stats`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.total_games).toBeGreaterThanOrEqual(1)
        expect(res.body.total_wins).toBeGreaterThanOrEqual(1)
        expect(typeof res.body.total_losses).toBe('number')
        expect(res.body.vs_bot.random.wins).toBeGreaterThanOrEqual(1)
        expect(typeof res.body.vs_bot.random.losses).toBe('number')
    })

    it('does NOT update stats when result is DRAW (user quit)', async () => {
        // Get stats before
        const statsBefore = (await request(app)
            .get(`/users/${userId}/stats`)
            .set('Authorization', `Bearer ${token}`)).body

        // Create a new game and draw it
        const createRes = await request(app)
            .post('/games')
            .send({ board_size: 7 })
            .set('Authorization', `Bearer ${token}`)
        await request(app)
            .put(`/games/${createRes.body._id}/finish`)
            .send({ result: 'DRAW' })
            .set('Authorization', `Bearer ${token}`)

        // Stats should be unchanged
        const statsAfter = (await request(app)
            .get(`/users/${userId}/stats`)
            .set('Authorization', `Bearer ${token}`)).body

        // DRAW must not affect wins or losses
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
        // Moves should not be included in history
        res.body.forEach(game => {
            expect(game).not.toHaveProperty('moves')
        })
    })
})