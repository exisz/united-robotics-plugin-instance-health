# Instance Health — United Robotics local plugin

Health monitor for every United Robotics World instance, shown as one Capital window. Same `mount` / `invoke` / one-shot `rpc.mjs` architecture as Todo List and Network Access. React, Radix Themes, CSS and the standalone Node backend are bundled into committed artifacts. No Worker, hosted backend, extra daemon or World change; the only credential is an optional Cloudflare Access service token.

## What it checks

The backend probes a fixed list of `/healthz` endpoints in parallel (8 s timeout each, redirects not followed). Each instance has two services: World and its OpenClaw Gateway.

| Instance | World | OpenClaw |
|---|---|---|
| Capital | `capital.unitedrobotics.app`, `capital.queue-musical.ts.net` | `20487f09-3201-49d5-9de9-06e8ec8db823.unitedrobotics.app`, `claw2.queue-musical.ts.net` |
| Yes Education | `yes.unitedrobotics.app`, `yes.queue-musical.ts.net` | `yes-openclaw.unitedrobotics.app`, `yes-openclaw.queue-musical.ts.net` |
| Beauty (SkinSpirit) | `skinspirit.queue-musical.ts.net` | none yet |

Each endpoint is `up` (HTTP 200 with World's `{"ok":true}` or the Gateway's `{"ok":true,"status":"live"}`, plus `x-world-application-revision` when present), `gated` (Cloudflare Access answered first, so the origin is unknown), `down` (5xx, tunnel error or non-health body) or `unreachable` (DNS/TLS/connection failure or timeout). Each service and each instance is healthy only when every one of its endpoints is up; Access gating never counts as healthy. The browser cannot supply targets: adding an instance means publishing a new plugin revision.

### Passing Cloudflare Access

The public `*.unitedrobotics.app` hostnames sit behind Cloudflare Access. When the plugin receives `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (an Access Service Token), it sends them as `CF-Access-Client-Id` / `CF-Access-Client-Secret` to those public hostnames only, never to tailnet or other hosts. On the Cloudflare side the token is a general machine token: each existing Access application ("Capital + OpenClaw", "Yes Education + OpenClaw") has an extra Service Auth (`non_identity`) policy for it, so it passes Access on the whole host. Behind Access, World still requires Logto and OpenClaw still requires its Gateway token. Keep it server-side only (plugin secrets, roblocks); never send it to a browser. Without the token the public endpoints show as gated with "未配置 Cloudflare Access 服务令牌"; a rejected token shows "Cloudflare Access 拒绝了服务令牌".

The secrets reach the backend through the frontline `connectors.json`:

```json
{"localPlugins":{"instance-health":{"requiredSecrets":[
  {"key":"CF_ACCESS_CLIENT_ID","label":"健康检查 Cloudflare Access 令牌 ID"},
  {"key":"CF_ACCESS_CLIENT_SECRET","label":"健康检查 Cloudflare Access 令牌密钥"}]}}}
```

Declare them only after both values exist in the instance secret store: World refuses to run a plugin whose required secrets are missing.

The window refreshes every minute while open and on demand. A failed check keeps the previous result visible with the error; it never shows placeholders as healthy.

## Build and publish

`npm ci && npm run check`, commit reproducible `dist/` files and publish canonical main. Capital pins `https://cdn.jsdelivr.net/gh/exisz/united-robotics-plugin-instance-health@<full SHA>/dist/manifest.json` with `props.window: "health"`. The Access token secrets are optional (see above).

## Verification boundary

Tests cover the fixed target list, manual-redirect probing, OpenClaw Gateway health bodies, Access token headers sent only to public hosts and never echoed, classification of Access redirects / 502 / wrong body / DNS / timeout, instance roll-up, rejection of caller-supplied targets, the one-shot protocol, jsDelivr-style rendering in jsdom and Chromium (dark/light, scoped CSS, 360 px, cleanup). Results seen from production depend on what the Capital connector container can reach (tailnet DNS, Cloudflare Access); that must be checked in the real Capital window.
