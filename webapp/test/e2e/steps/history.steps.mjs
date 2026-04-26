import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert'

When('I open the game history page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.locator('[aria-label="YOVI home"]').click()
  await page.getByRole('link', { name: 'Game History' }).waitFor({ timeout: 10_000 })
  await page.getByRole('link', { name: 'Game History' }).click()
  await page.getByRole('heading', { name: 'Game History' }).waitFor({ timeout: 10_000 })
})

When('I surrender game', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.locator('[aria-label="Surrender game"]').click()
  await page.locator('.game-result-text').waitFor({ timeout: 10_000 })
})

When('I click the first game history entry', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const firstEntry = page.locator('.history-item__button').first()
  await firstEntry.waitFor({ timeout: 10_000 })
  await firstEntry.click()
})

Then('I should see the game history heading', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('heading', { name: 'Game History' }).waitFor({ timeout: 10_000 })
})

Then('the game history should show {string}', async function (message) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByText(message, { exact: false }).waitFor({ timeout: 10_000 })
})

Then('the game history list should have at least {int} entry', async function (minEntries) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const list = page.locator('[aria-label="Played games history"]')
  await list.waitFor({ timeout: 10_000 })
  const items = list.locator('.history-item')
  await items.first().waitFor({ timeout: 10_000 })
  const count = await items.count()
  assert.ok(count >= minEntries, `Expected at least ${minEntries} entry/entries, got ${count}`)
})

Then('the game history should show a {string} result', async function (result) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const resultBadge = page.locator('.history-result')
  await resultBadge.first().waitFor({ timeout: 10_000 })
  const text = await resultBadge.first().textContent()
  assert.ok(
    text.toUpperCase().includes(result.toUpperCase()),
    `Expected result badge to contain '${result}', got '${text}'`
  )
})
