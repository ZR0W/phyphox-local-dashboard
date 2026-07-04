# Phyphox Local Dashboard

A local web dashboard that connects to multiple mobile devices running phyphox, displays their live sensor data, and provides controls to view, filter, record, and export it. Runs entirely on your own laptop — no cloud dependency.

> **Status: Phases 0–2 done** (scaffolding, single-device polling backbone, minimal live-chart frontend). The full design and roadmap live in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md); ongoing agent-session context lives in [`CLAUDE.md`](./CLAUDE.md). The sections below will keep filling in as each roadmap phase lands — see `IMPLEMENTATION_PLAN.md` Section 9 for the full spec this README is expected to satisfy.

## Prerequisites

- Node.js 22+
- A phone with the [phyphox app](https://phyphox.org/) installed
- Phone and laptop on the same routable network (a phone hotspot is the most reliable option)

## Phone-side setup

1. Open phyphox, load or select the experiment you want to stream.
2. Open the menu and enable **"Allow remote access."**
3. Note the `IP:port` phyphox displays (Android typically `8080`; iOS typically `80`/blank).

## Installation

```bash
npm install
```

## Starting the server

```bash
npm run dev:backend    # Fastify backend on http://localhost:4173 (polls phyphox devices)
npm run dev:frontend   # Vite dashboard UI on http://localhost:5173 (proxies /api and /ws to the backend)
```

Open `http://localhost:5173` once both are running. _A single combined `npm start` that launches both and opens a browser tab automatically lands in Phase 7 — see the roadmap._

## Adding a device

1. On the phone, enable phyphox's remote access (see "Phone-side setup" above) and note the `IP:port` shown.
2. In the dashboard, fill in the **Nickname** and **IP:port** fields (e.g. `192.168.1.23:8080`) and click **+ Add Device**.
3. The dashboard discovers the experiment's sensor buffers automatically and starts streaming; the device's status updates from `reconnecting` to `connected` once the first poll succeeds.

_A dedicated per-device sensor picker (choosing which buffers to display, rather than showing the first one) lands in Phase 3._

## Controls reference

| Control                         | Scope       | Effect                                                            |
| ------------------------------- | ----------- | ----------------------------------------------------------------- |
| `POST /api/devices`             | one device  | registers a device and starts polling it (`{ name, baseUrl }`)    |
| `DELETE /api/devices/:id`       | one device  | stops polling and forgets the device (does not affect the phone)  |
| `POST /api/devices/:id/control` | one device  | sends `/control?cmd=start\|stop\|clear` to that phone (`{ cmd }`) |
| `GET /api/devices`              | all devices | lists currently registered devices and their status/sensors       |

_Global Start All/Stop All/Clear All buttons and a Record/Export UI land in Phases 4–5 — see `IMPLEMENTATION_PLAN.md` Section 9 for the full spec._

## Troubleshooting

- **Device stuck on "reconnecting"**: confirm the phone and laptop are on the same network segment (a phone hotspot is the most reliable option) and that phyphox's remote access is still enabled.
- **iOS devices**: the port is often blank/`80` rather than `8080` — enter just the IP if the phyphox app doesn't show a port.
- **`Device address must use http`**: the dashboard only accepts `http://` addresses (phyphox doesn't serve https) and strips any path/query you paste in — enter just the host and port.

## Development

```bash
npm run lint       # ESLint across all workspaces
npm run format     # Prettier check
npm run typecheck  # TypeScript across all workspaces
npm run test       # Vitest across all workspaces
npm run build      # Build all workspaces
```

This is an npm-workspaces monorepo: `shared/` (types shared between backend and frontend), `backend/` (Node.js/Fastify server that polls phyphox devices), `frontend/` (React/Vite dashboard UI).
