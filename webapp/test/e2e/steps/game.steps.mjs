import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert'

const APP_URL = 'http://localhost:5173'

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

When('I open the new game page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.goto(`${APP_URL}/games/new`)
  await page.getByRole('heading', { name: 'New Game' }).waitFor({ timeout: 10_000 })
})

When('I configure a local player game with opponent {string}', async function (opponentName) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  // Select local player mode to keep the scenario deterministic (no bot turn timing).
  await page.getByLabel('Play vs Player', { exact: false }).check()
  await page.getByLabel('Opponent Name', { exact: true }).fill(opponentName)
})

When('I start the game', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('button', { name: 'Start Game' }).click()
})

Then('I should be on a game page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('heading', { name: 'Game' }).waitFor({ timeout: 10_000 })
  assert.ok(
    /\/games\/[^/]+$/.test(new URL(page.url()).pathname),
    `Expected '/games/:id' path, got '${page.url()}'`
  )
})

Then('I should see the game board', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.locator('[aria-label="game board"]').waitFor({ timeout: 10_000 })
})

When('I play the first available hex', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const firstHex = page.getByRole('button', { name: /^Hex \(/ }).first()
  await firstHex.waitFor({ timeout: 10_000 })

  const before = (await firstHex.getAttribute('aria-label')) ?? ''
  this.lastPlayedHexBaseLabel = before.replace(/\s-\s(Blue|Red)$/u, '')

  await firstHex.click()
})

Then('move history should contain at least 1 move', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const history = page.locator('.move-history')
  await history.getByRole('heading', { name: 'Move History' }).waitFor({ timeout: 10_000 })

  const historyItems = history.locator('li')
  await historyItems.first().waitFor({ timeout: 10_000 })
  const count = await historyItems.count()
  assert.ok(count >= 1, `Expected at least 1 move in history, got ${count}`)

  if (this.lastPlayedHexBaseLabel) {
    const base = escapeRegExp(this.lastPlayedHexBaseLabel)
    const filled = page.getByRole('button', { name: new RegExp(`^${base} - (Blue|Red)$`) })
    await filled.first().waitFor({ timeout: 10_000 })
  }
})
