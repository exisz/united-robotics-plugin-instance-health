# Instance Health — United Robotics local plugin

Health monitor for every United Robotics World instance, shown as one Capital window. Same `mount` / `invoke` / one-shot `rpc.mjs` architecture as Todo List and Network Access. React, Radix Themes, CSS and the standalone Node backend are bundled into committed artifacts. No Worker, hosted backend, credentials, extra daemon or World change.

## What it checks

The backend probes a fixed list of unauthenticated World `/healthz` endpoints in parallel (8 s timeout each, redirects not followed):

| Instance | Endpoints |
|---|---|
| Capital | `capital.unitedrobotics.app`, `capital.queue-musical.ts.net` |
| Yes Education | `yes.unitedrobotics.app`, `yes.queue-musical.ts.net` |
| Beauty (SkinSpirit) | `skinspirit.queue-musical.ts.net` |

Each endpoint is `up` (HTTP 200 with `{"ok":true}`, plus `x-world-application-revision` when present), `gated` (Cloudflare Access answered first, so the origin is unknown), `down` (5xx, tunnel error or non-World body) or `unreachable` (DNS/TLS/connection failure or timeout). An instance is healthy only when every endpoint is up; Access gating never counts as healthy. The browser cannot supply targets: adding an instance means publishing a new plugin revision.

The window refreshes every minute while open and on demand. A failed check keeps the previous result visible with the error; it never shows placeholders as healthy.

## Build and publish

`npm ci && npm run check`, commit reproducible `dist/` files and publish canonical main. Capital pins `https://cdn.jsdelivr.net/gh/exisz/united-robotics-plugin-instance-health@<full SHA>/dist/manifest.json` with `props.window: "health"`. No `connectors.json` secret declaration is needed.

## Verification boundary

Tests cover the fixed target list, manual-redirect probing, classification of Access redirects / 502 / wrong body / DNS / timeout, instance roll-up, rejection of caller-supplied targets, the one-shot protocol, jsDelivr-style rendering in jsdom and Chromium (dark/light, scoped CSS, 360 px, cleanup). Results seen from production depend on what the Capital connector container can reach (tailnet DNS, Cloudflare Access); that must be checked in the real Capital window.
