# CLAUDE.md — Agent Context for phyphox-local-dashboard

Read this file first in any new session on this repo. It is a short status snapshot, not a design doc — for full architecture/rationale see `IMPLEMENTATION_PLAN.md`.

## What this project is

A local web dashboard (runs on a researcher's laptop, no cloud) that connects to multiple mobile devices running **phyphox**, each exposing its sensors over phyphox's built-in unauthenticated HTTP remote-access interface (`/get`, `/config`, `/meta`, `/control`, `/time`, `/export`). The dashboard polls each device, re-publishes live data to a browser UI over WebSocket, and provides view/filter/record/export/control features across all connected devices. Full detail: `IMPLEMENTATION_PLAN.md`.

## Current status

**Phases 0–2 complete.** Phase 0: npm-workspaces monorepo (`shared/`, `backend/`, `frontend/`) with TypeScript, ESLint (flat config), Prettier, Vitest, GitHub Actions CI. Phase 1: backend polling backbone — `backend/src/phyphox/client.ts` wraps phyphox's `/config`, `/meta`, `/control`, `/get` (threshold-based incremental fetch); `backend/src/poller.ts` (`DevicePoller`) discovers sensors then polls with exponential backoff/reconnect; `backend/src/deviceManager.ts` is the in-memory device registry; REST routes (`backend/src/routes.ts`) + a WebSocket hub (`backend/src/ws.ts`, using `ws`, path `/ws`) expose it. Phase 2: frontend has an Add Device form, a `useDashboardSocket` hook consuming the WebSocket, and one live `uPlot` chart per device (`frontend/src/components/`). Verified end-to-end against a mock phyphox HTTP server in an integration test (`backend/src/integration.test.ts`) and manually in a real browser via Playwright against the same mock. Next up: Phase 3 (multi-device polish: sensor picker, connection-status UI, reconnect UX) per `IMPLEMENTATION_PLAN.md` Section 11.

**Important build-order fix (carried forward, don't regress):** `shared/package.json`'s `main`/`types` point at `./dist/index.js`/`./dist/index.d.ts`, not raw `.ts` — Node 22 cannot load `.ts` files directly. Root `package.json` has a `postinstall` hook and `typecheck`/`test` prerequisites that run `npm run build --workspace shared` first; if you add new root scripts that skip this, a fresh clone will fail at runtime with `ERR_UNKNOWN_FILE_EXTENSION` the moment backend/frontend imports `@phyphox-dashboard/shared`.

**phyphox wire format notes (see `backend/src/phyphox/client.ts` doc comment):** `/config`, `/meta` schemas aren't fully documented publicly — client code was built from the phyphox wiki summary plus a community client's confirmed behavior (`/control` returns `{result: boolean}`; `/get` threshold syntax is `time=X&buf=X|time`). `/meta` is treated as an opaque passthrough since nothing currently depends on its fields. `/time` (wall-clock alignment) is intentionally not yet implemented — deferred to whenever Section 4.1's sync question gets resolved. Treat all of this as best-effort until validated against a real phyphox device.

## Locked-in architectural decisions (don't re-litigate without reason)

- Backend owns **all** polling of phone devices; the browser never talks to phones directly — only to the local backend via REST + WebSocket. (`IMPLEMENTATION_PLAN.md` Section 1)
- Stack: Node.js + TypeScript backend (Fastify, `ws`, `better-sqlite3`), React + TypeScript + Vite frontend, uPlot for real-time charts, Zustand for state, Tailwind for styling. (Section 2)
- Packaging for v1: plain `npm start` that launches the backend and opens a browser tab — no Electron unless/until the user asks for it. (Section 2, open question in Section 12)
- Phyphox's remote interface has no auth — the dashboard cannot add security phone-side; it binds to `localhost` by default and warns the user to stay on a private network. (Section 8)

## Open questions not yet resolved (do not silently decide these — see `IMPLEMENTATION_PLAN.md` Section 4 and 12 for full context)

1. **Cross-device timestamp trust**: can `/time`-aligned timestamps from two different phones be treated as directly comparable, and to what tolerance? Needs a real synchronized-capture test before deciding. (Plan Section 4.1)
2. **Pause/resume semantics**: if one device is stopped/paused while others keep running and later resumes, what happens to its clock and how should the dashboard represent the gap in recorded/exported data? Needs a real pause/resume test capture before deciding. (Plan Section 4.2)
3. Preferred export format (raw per-device CSV vs. combined time-aligned CSV vs. both) — unresolved, ask the user.
4. Expected max concurrent device count — affects whether default 200ms polling is safe or needs adaptive scaling — unresolved, ask the user.

## Documentation maintenance rule

`README.md` (setup/getting-started/controls reference) and this `CLAUDE.md` must be updated as part of the definition-of-done for any phase/PR that changes a feature, control, or architectural decision — not deferred as separate cleanup. See `IMPLEMENTATION_PLAN.md` Sections 9 and 10.

## How to run locally

```bash
npm install   # postinstall builds shared/dist automatically
npm run lint && npm run format && npm run typecheck && npm run test && npm run build
npm run dev:backend    # Fastify + poller + WebSocket hub on http://localhost:4173
npm run dev:frontend   # Vite dashboard on http://localhost:5173 (proxies /api, /ws to :4173)
```
