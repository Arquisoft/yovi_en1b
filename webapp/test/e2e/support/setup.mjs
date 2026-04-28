import { setWorldConstructor, Before, After, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium, firefox, webkit } from 'playwright'
import { execSync } from 'node:child_process'

setDefaultTimeout(60_000)

// BeforeAll(async function () {
//   try {
//     execSync(
//       'docker exec mongodb mongosh app_database --eval "db.users.deleteMany({}); db.games.deleteMany({})"',
//       { stdio: 'pipe' }
//     )
//   } catch {
//   }
// })

class CustomWorld {
  browser = null
  page = null
}

setWorldConstructor(CustomWorld)

Before(async function () {
  const headless = process.env.HEADLESS !== 'false'
  const slowMo = process.env.SLOWMO ? parseInt(process.env.SLOWMO, 10) : 0
  const devtools = false

  const browserName = process.env.BROWSER || 'chromium'
  let browserType
  switch (browserName.toLowerCase()) {
    case 'firefox':
      browserType = firefox
      break
    case 'webkit':
      browserType = webkit
      break
    case 'chromium':
    default:
      browserType = chromium
      break
  }

  this.browser = await browserType.launch({ headless, slowMo, devtools })
  this.page = await this.browser.newPage()
})

After(async function () {
  if (this.page) {
    try {
      // Try to delete the user using the API before closing the browser
      const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000'
      await this.page.evaluate(async (url) => {
        const token = localStorage.getItem('auth_token')
        if (token) {
          await fetch(`${url}/deleteuser`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          })
          localStorage.clear()
        }
      }, apiUrl)
    } catch (err) {
      // Silently fail if cleanup is not possible (e.g. user already deleted or no token)
    }
    await this.page.close()
  }
  if (this.browser) await this.browser.close()
})
