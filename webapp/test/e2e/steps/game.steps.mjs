import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert'

const APP_URL = process.env.APP_URL || 'http://localhost'

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

When('I open the new game page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('link', { name: 'Create New Game' }).click()
  await page.getByRole('heading', { name: 'New Game' }).waitFor({ timeout: 10_000 })
})

When('I configure a local player game with opponent {string}', async function (opponentName) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByLabel('Play vs Player', { exact: false }).check()
  await page.getByLabel('Opponent Name', { exact: true }).fill(opponentName)
})

When('I select {string} mode', async function (mode) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByLabel(mode, { exact: false }).check()

  if (mode.toLowerCase().includes('bot')) {
    await page.getByRole('button', { name: 'Start Game' }).waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForFunction(
      () => !document.querySelector('button[class*="btn-primary"]')?.disabled,
      { timeout: 15_000 }
    )
  }
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

Then('the bot should play a move', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const history = page.locator('.move-history')
  await history.getByRole('heading', { name: 'Move History' }).waitFor({ timeout: 15_000 })

  const historyItems = history.locator('li')
  await page.waitForFunction(
    () => document.querySelectorAll('.move-history li').length >= 2,
    { timeout: 15_000 }
  )
  const count = await historyItems.count()
  assert.ok(count >= 2, `Expected at least 2 moves (player + bot), got ${count}`)
})

When('I set the board size to {int}', async function (size) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const slider = page.locator('#boardSize')
  await slider.waitFor({ timeout: 10_000 })
  await slider.evaluate((el, value) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    nativeSetter.call(el, String(value))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, size)
})

When('I play hex at {string}', async function (coords) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const hexButton = page.getByRole('button', { name: `Hex (${coords})`, exact: true })
  await hexButton.waitFor({ timeout: 10_000 })
  await hexButton.click()

  await page.waitForFunction(
    (label) => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label')?.startsWith(label + ' - ')
      )
      return !!btn
    },
    `Hex (${coords})`,
    { timeout: 10_000 }
  )
})

async function playHexAt(page, coords) {
  const hexButton = page.getByRole('button', { name: `Hex (${coords})`, exact: true })
  await hexButton.waitFor({ timeout: 10_000 })
  await hexButton.click()

  const result = await page.waitForFunction(
    (label) => {
      const colored = [...document.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label')?.startsWith(label + ' - ')
      )
      const finished = document.querySelector('.game-result-text')
      const error = document.querySelector('.game-error, .error, [role="alert"]')
      if (colored || finished) return 'ok'
      if (error) return 'error:' + error.textContent
      return false
    },
    `Hex (${coords})`,
    { timeout: 15_000 }
  )

  const value = await result.jsonValue()
  if (typeof value === 'string' && value.startsWith('error:')) {
    throw new Error(`Move at Hex (${coords}) failed: ${value}`)
  }
}

When('I play a full game until Blue wins', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const blueActive = page.locator('.player-panel--blue.active')
  const redActive = page.locator('.player-panel--red.active')

  await page.locator('.player-panel.active').waitFor({ timeout: 10_000 })
  const blueFirst = await blueActive.isVisible().catch(() => false)

  if (blueFirst) {
    await playHexAt(page, '0, 0, 2')
    await playHexAt(page, '2, 0, 0')
    await playHexAt(page, '0, 1, 1')
    await playHexAt(page, '0, 2, 0')
    await playHexAt(page, '1, 1, 0')
  } else {
    await playHexAt(page, '2, 0, 0')
    await playHexAt(page, '0, 0, 2')
    await playHexAt(page, '0, 2, 0')
    await playHexAt(page, '0, 1, 1')
    await playHexAt(page, '1, 0, 1')
    await playHexAt(page, '1, 1, 0')
  }
})

Then('the game result should show {string}', async function (expectedResult) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const resultText = page.locator('.game-result-text')
  await resultText.waitFor({ timeout: 15_000 })
  const text = await resultText.textContent()
  assert.strictEqual(text?.trim(), expectedResult, `Expected game result "${expectedResult}", got "${text}"`)
})
