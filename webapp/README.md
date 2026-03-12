# Game Y - Frontend

Frontend for Game Y, a hexagonal board game built with React, TypeScript, and Vite.

## Setup

### Install dependencies

```bash
npm install
```

### MSW worker initialization

```bash
npm run msw:init
```

This sets up the Mock Service Worker files in `public/`.

## Development

### Run dev server (real API)

```bash
npm run dev
```

Connects to the backend at `http://localhost:3000` by default (set `VITE_API_URL` to override).

### Run dev server with mock API

```bash
npm run dev:mock
```

Activates MSW to mock auth and game endpoints locally.

## Testing

### Run unit tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

## Build

```bash
npm run build
```

## Linting

```bash
npm run lint
```

## Project structure

- **`src/api/`** - HTTP client and API endpoints (auth, games)
- **`src/components/`** - UI components and layouts
  - `ui/` - Atomic components (Panel, Button, etc.)
  - `layout/` - Application shell (TopBar, AppLayout)
- **`src/features/`** - Feature-specific logic
  - `auth/` - Authentication (AuthProvider, context)
- **`src/hooks/`** - Custom React hooks
- **`src/mocks/`** - MSW mock handlers (dev/test)
- **`src/pages/`** - Page components (Home, Game, Profile, etc.)
- **`src/types/`** - TypeScript domain types
- **`src/test/`** - Test utilities and setup
- **`src/utils/`** - Helper functions

## Environment variables

- `VITE_API_URL` - Backend API root (default: `http://localhost:3000`)
- `VITE_USE_MSW` - Enable MSW mocking in dev mode (set to `true`)
```
