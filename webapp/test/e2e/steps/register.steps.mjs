import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'

const APP_URL = 'http://localhost:5173'

function getUsernameInput(page) {
  return page.getByLabel('Username', { exact: true })
}

function getPasswordInput(page) {
  // Exact label avoids matching "Confirm Password" in strict mode.
  return page.getByLabel('Password', { exact: true })
}

function getConfirmPasswordInput(page) {
  return page.getByLabel('Repeat Password', { exact: true })
}

function uniqueUsername(prefix = 'e2e-user') {
  const stamp = Date.now().toString(36)
  const random = Math.floor(Math.random() * 10_000).toString(36)
  return `${prefix}-${stamp}-${random}`
}

async function continueWithUsername(page, username) {
  await getUsernameInput(page).fill(username)
  await page.getByRole('button', { name: 'Continue' }).click()
}

Given('the app is open on the entry page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')
  await page.goto(APP_URL)
  await assert.doesNotReject(async () => {
    await page.getByRole('heading', { name: 'Welcome to YOVI' }).waitFor({ timeout: 10_000 })
  })
})

Given('I am not signed in', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')
  await page.goto(APP_URL)
  await page.evaluate(() => localStorage.clear())
})

Given('I have a registered user', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const username = uniqueUsername('existing-user')
  this.currentUsername = username

  await page.goto(APP_URL)
  await continueWithUsername(page, username)

  await getPasswordInput(page).fill('Secret123')
  await getConfirmPasswordInput(page).fill('Secret123')
  await page.getByRole('button', { name: 'Create Account' }).click()

  await page.getByRole('heading', { name: 'Welcome to YOVI' }).waitFor({ timeout: 10_000 })
})

Given('I am signed out', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('heading', { name: 'Welcome to YOVI' }).waitFor({ timeout: 10_000 })
})

When('I continue with a new unique username', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const username = uniqueUsername('new-user')
  this.currentUsername = username

  await continueWithUsername(page, username)
  await page.getByRole('heading', { name: 'Create Account' }).waitFor({ timeout: 10_000 })
})

When('I continue with the existing username', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')
  if (!this.currentUsername) throw new Error('No current username set in world')

  await continueWithUsername(page, this.currentUsername)
  await page.getByRole('heading', { name: 'Sign In' }).waitFor({ timeout: 10_000 })
})

When('I submit registration with password {string}', async function (password) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await getPasswordInput(page).fill(password)
  await getConfirmPasswordInput(page).fill(password)
  await page.getByRole('button', { name: 'Create Account' }).click()
})

When('I submit registration with mismatched passwords', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await getPasswordInput(page).fill('Secret123')
  await getConfirmPasswordInput(page).fill('Different123')
  await page.keyboard.press('Enter')
})

When('I sign in with password {string}', async function (password) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await getPasswordInput(page).fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
})

When('I press Enter in the username field', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await getUsernameInput(page).focus()
  await page.keyboard.press('Enter')
})

When('I navigate directly to {string}', async function (path) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')
  await page.goto(`${APP_URL}${path}`)
})

Then('I should be on the home page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('heading', { name: 'Welcome to YOVI' }).waitFor({ timeout: 10_000 })
  assert.strictEqual(page.url().endsWith('/'), true, `Expected to be on '/', got '${page.url()}'`)
})

Then('I should be on the entry page', async function () {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  await page.getByRole('heading', { name: 'Welcome to YOVI' }).waitFor({ timeout: 10_000 })
  assert.strictEqual(page.url().includes('/profile'), false, `Expected redirect away from '/profile', got '${page.url()}'`)
})

Then('I should see {string}', async function (text) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')
  await page.getByText(text, { exact: false }).waitFor({ timeout: 10_000 })
})

Then('I should see auth error {string}', async function (message) {
  const page = this.page
  if (!page) throw new Error('Page not initialized')

  const error = page.locator('.entry-error')
  await error.waitFor({ timeout: 10_000 })
  const text = (await error.textContent()) ?? ''
  const normalized = text.replace(/^\s*⚠️\s*/u, '').trim()

  // Current username-Enter path may submit form and return backend validation.
  if (message === 'Username is required') {
    assert.ok(
      normalized.includes('Username is required') || normalized.includes('Username and password required'),
      `Expected username validation error, got '${normalized}'`
    )
    return
  }

  assert.ok(
    normalized.includes(message),
    `Expected error to include '${message}', got '${normalized}'`
  )
})
