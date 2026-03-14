# E2E tests (Playwright + Cucumber)

This project uses Playwright for browser automation and Cucumber (`@cucumber/cucumber`) for Gherkin features.

Quick commands:

- Install Playwright browsers (once):

  ```bash
  npm run test:e2e:install-browsers
  ```

- Validate feature/step wiring only (no app startup, no browser launch):

  ```bash
  npm run test:e2e:dry-run
  ```

- Run full E2E (starts Vite + users service and executes all features):

  ```bash
  npm run test:e2e
  ```

Files of interest:
- `test/e2e/features/register.feature` - entry auth flow scenarios
- `test/e2e/features/route-guards.feature` - protected route redirect scenarios
- `test/e2e/features/gameplay.feature` - basic new-game and first-move scenarios
- `test/e2e/steps/register.steps.mjs` - auth/route step definitions
- `test/e2e/steps/game.steps.mjs` - gameplay step definitions
- `test/e2e/support/setup.mjs` - Cucumber World and Playwright hooks

Notes:
- If tests fail with missing Playwright executable, run `npm run test:e2e:install-browsers`.
- `test:e2e` uses `start-server-and-test` with `start:all` (`webapp` + `users`).
