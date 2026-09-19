# @nap/web

React web client for NAP, built with Vite and MUI. It renders a placeholder
shell today. The first real screens, login, session restore, and tenant
selection, follow the accepted PRDs in the
[roadmap](../../docs/roadmap/ROADMAP.md).

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
- `src/App.jsx` is the root component.
- `tests/` holds component tests.
