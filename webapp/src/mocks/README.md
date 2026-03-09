# MSW mocks

This directory contains Mock Service Worker handlers for local frontend development and tests.

## Covered endpoints

- `POST /createuser`
- `POST /login`
- `POST /v1/ybot/choose/:botId`

## Notes

- Browser mode is enabled by setting `VITE_USE_MSW=true`.
- Test mode uses `src/test/setup.ts` with `msw/node`.
- Unhandled requests are bypassed, so real endpoints still work when no handler exists.

