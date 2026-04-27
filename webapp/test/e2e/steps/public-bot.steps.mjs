import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'node:assert'

const USERS_URL = 'http://127.0.0.1:3000'

Given('the public bot API is reachable', async function () {
    try {
        const response = await fetch(`${USERS_URL}/games/options`);
        assert.strictEqual(response.ok, true, `Public Bot API is not reachable at ${USERS_URL}`);
    } catch (err) {
        throw new Error(`Public Bot API is NOT reachable: ${err.message}`);
    }
});

When('a player sends a game state with layout {string}', async function (layout) {
    const position = {
        size: 3,
        turn: 0,
        players: ["B", "R"],
        layout: layout
    };

    const url = new URL(`${USERS_URL}/play`);
    url.searchParams.append('position', JSON.stringify(position));
    url.searchParams.append('bot_id', 'mcts');

    const response = await fetch(url);
    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Public Bot API failed (${response.status}): ${errBody}`);
    }

    this.apiResponse = await response.json();
    this.sentLayout = layout;
});

Then('the bot should suggest a valid move on an empty cell', function () {
    const data = this.apiResponse;
    assert.ok(data.coords, 'Bot response missing coordinates');
    
    const { x, y, z } = data.coords;
    const size = 3;

    const r = (size - 1) - x;
    const c = y;
    const rowStart = (r * (r + 1)) / 2;
    const flatIndex = rowStart + c;

    const flatLayout = this.sentLayout.replace(/\//g, '');
    const cell = flatLayout[flatIndex];

    assert.strictEqual(cell, '.', `Bot suggested a move to an occupied cell "${cell}" (coords: ${x},${y},${z})`);
});
