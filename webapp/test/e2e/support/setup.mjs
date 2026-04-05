import { setWorldConstructor, Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium, firefox, webkit } from 'playwright'

setDefaultTimeout(60_000)

class CustomWorld {
  browser = null
  page = null
}

setWorldConstructor(CustomWorld)

Before(async function () {
  // Allow turning off headless mode and enabling slow motion/devtools via env vars
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
  if (this.page) await this.page.close()
  if (this.browser) await this.browser.close()
})
