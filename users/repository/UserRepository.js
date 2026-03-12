class UserRepository {
    async findByUsername(username) {
        throw new Error('Not implemented');
    }

    async findById(id) {
        throw new Error('Not implemented');
    }

    async create(userData) {
        throw new Error('Not implemented');
    }

    async updateStats(userId, gameData) {
        throw new Error('Not implemented');
    }

    async findGamesByPlayer(playerId) {
        throw new Error('Not implemented');
    }

    async createGame(gameData) {
        throw new Error('Not implemented');
    }

    async findGameById(gameId) {
        throw new Error('Not implemented');
    }

    async updateGame(gameId, updateData) {
        throw new Error('Not implemented');
    }
}

module.exports = UserRepository;