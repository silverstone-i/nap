# @nap/web

React web client for NAP, built with Vite and MUI. It implements login, session
restore, tenant selection, and the platform administration screens
([I0001](../../docs/PRDs/inter-module-workflows/I0001-application-entry-and-shell.md),
[I0002](../../docs/PRDs/inter-module-workflows/I0002-platform-administration-screens.md)).

## Commands

Run from the repository root.

| Command           | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `npm run dev:web` | Start the Vite dev server. `/api` and `/health` proxy to `http://localhost:3000`. |
| `npm run build`   | Build every workspace. This one writes `dist/`.                                   |
| `npm test`        | Vitest with jsdom and Testing Library.                                            |

## How it reaches the API

The browser calls same-origin `/api/...` routes only. In development Vite
proxies them to the API. In production the API serves `dist/` itself. See
[BFF](../../docs/architecture/bff.md).

## Layout

- `index.html` is the Vite entry. It loads `src/main.jsx`.
- `src/main.jsx` mounts `App` under strict mode.
- `src/App.jsx` is the root component and route table.
- `src/api/`: the same-origin API client and endpoint list.
- `src/auth/`: session context, route guards, and status screens.
- `src/shell/`: the application shell, headers, and navigation.
- `src/pages/`: login, password, tenant selection, and management pages.
- `src/grid/`: the standard data grid and confirm dialog.
- `src/theme/`: theme tokens and light/dark mode.
- `src/storage/`: guarded `localStorage` access.
- `src/spreadsheet/`: spreadsheet placeholder.
- `tests/` holds component tests.
