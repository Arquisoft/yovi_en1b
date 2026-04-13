import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert'

When('I open the leaderboard page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.locator('[aria-label="YOVI home"]').click()
  await page.getByRole('link', { name: 'Leaderboard' }).waitFor({ timeout: 10_000 })
  await page.getByRole('link', { name: 'Leaderboard' }).click()
  await page.getByRole('heading', { name: 'Leaderboard' }).waitFor({ timeout: 10_000 })
})

Then('I should see the leaderboard heading', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('heading', { name: 'Leaderboard' }).waitFor({ timeout: 10_000 })
})

Then('the leaderboard table should show empty or loading state', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const empty = page.locator('.leaderboard-empty')
  const error = page.locator('.leaderboard-error')
  const loading = page.locator('.leaderboard-loading')
  const tab = page.locator('.leaderboard-tab--active')

  await Promise.race([
    empty.waitFor({ timeout: 15_000 }).catch(() => null),
    error.waitFor({ timeout: 15_000 }).catch(() => null),
    loading.waitFor({ timeout: 15_000 }).catch(() => null),
    tab.waitFor({ timeout: 15_000 }).catch(() => null)
  ])

  const anyVisible =
    await empty.isVisible().catch(() => false) ||
    await error.isVisible().catch(() => false) ||
    await loading.isVisible().catch(() => false) ||
    await tab.isVisible().catch(() => false)

  assert.ok(anyVisible, 'Expected leaderboard to show empty state, error, loading, or tabs')
})

Then('the leaderboard should show my username with {int} win and {int} game', async function (expectedWins, expectedGames) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const username = this.currentUsername
  assert.ok(username, 'No current username set on test context')

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null)
  await page.locator('.leaderboard-tab--active').waitFor({ timeout: 15_000 })
  await page.locator('.leaderboard-table-wrapper').waitFor({ timeout: 15_000 })

  const playerCell = page.locator('.leaderboard-player', { hasText: username })
  await playerCell.waitFor({ timeout: 15_000 })

  const row = playerCell.locator('..')
  const wins = await row.locator('.leaderboard-wins').textContent()
  const games = await row.locator('.leaderboard-games').textContent()

  assert.strictEqual(
    parseInt(wins?.trim() ?? '0', 10),
    expectedWins,
    `Expected ${expectedWins} win(s), got ${wins}`
  )
  assert.strictEqual(
    parseInt(games?.trim() ?? '0', 10),
    expectedGames,
    `Expected ${expectedGames} game(s), got ${games}`
  )
})