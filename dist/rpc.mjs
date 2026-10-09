// src/backend.mjs
var instances = [
  { id: "capital", name: "Capital", endpoints: [
    { id: "world-public", service: "world", label: "\u516C\u7F51", url: "https://capital.unitedrobotics.app/healthz" },
    { id: "world-tailnet", service: "world", label: "Tailnet", url: "https://capital.queue-musical.ts.net/healthz" },
    { id: "openclaw-public", service: "openclaw", label: "\u516C\u7F51", url: "https://20487f09-3201-49d5-9de9-06e8ec8db823.unitedrobotics.app/healthz" },
    { id: "openclaw-tailnet", service: "openclaw", label: "Tailnet", url: "https://claw2.queue-musical.ts.net/healthz" }
  ] },
  { id: "yes", name: "Yes Education", endpoints: [
    { id: "world-public", service: "world", label: "\u516C\u7F51", url: "https://yes.unitedrobotics.app/healthz" },
    { id: "world-tailnet", service: "world", label: "Tailnet", url: "https://yes.queue-musical.ts.net/healthz" },
    { id: "openclaw-public", service: "openclaw", label: "\u516C\u7F51", url: "https://yes-openclaw.unitedrobotics.app/healthz" },
    { id: "openclaw-tailnet", service: "openclaw", label: "Tailnet", url: "https://yes-openclaw.queue-musical.ts.net/healthz" }
  ] },
  // Beauty has no public hostname and no OpenClaw entry of its own yet.
  { id: "beauty", name: "Beauty\uFF08SkinSpirit\uFF09", endpoints: [
    { id: "world-tailnet", service: "world", label: "Tailnet", url: "https://skinspirit.queue-musical.ts.net/healthz" }
  ] }
];
var timeoutMs = 8e3;
var accessHost = /^[a-z0-9-]+\.unitedrobotics\.app$/;
function accessHeaders(url, env = process.env) {
  const id = env.CF_ACCESS_CLIENT_ID, secret = env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret || !accessHost.test(new URL(url).hostname)) return {};
  return { "cf-access-client-id": id, "cf-access-client-secret": secret };
}
var healthyBody = (body) => body?.ok === true || ["live", "ok", "ready", "healthy"].includes(body?.status);
async function probe(endpoint, fetchImpl = fetch, now = () => performance.now(), env = process.env) {
  const started = now();
  const result = { id: endpoint.id, service: endpoint.service, label: endpoint.label, url: endpoint.url };
  const access = accessHeaders(endpoint.url, env);
  let response;
  try {
    response = await fetchImpl(endpoint.url, { redirect: "manual", cache: "no-store", headers: { accept: "application/json", ...access }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const cause = error?.cause?.code ?? error?.name ?? "error";
    return { ...result, state: "unreachable", latencyMs: Math.round(now() - started), detail: cause === "TimeoutError" ? `${timeoutMs / 1e3} \u79D2\u8D85\u65F6` : String(cause) };
  }
  const latencyMs = Math.round(now() - started), httpStatus = response.status;
  const location = response.headers.get("location") ?? "";
  if (/cloudflareaccess\.com/i.test(location) || httpStatus >= 300 && httpStatus < 400 && response.headers.has("cf-access-domain") || httpStatus === 403 && response.headers.has("cf-access-aud"))
    return { ...result, state: "gated", httpStatus, latencyMs, detail: access["cf-access-client-id"] ? "Cloudflare Access \u62D2\u7EDD\u4E86\u670D\u52A1\u4EE4\u724C" : "\u672A\u914D\u7F6E Cloudflare Access \u670D\u52A1\u4EE4\u724C" };
  let body = null;
  try {
    body = JSON.parse((await response.text()).slice(0, 4096));
  } catch {
  }
  if (httpStatus === 200 && healthyBody(body)) {
    const revision = response.headers.get("x-world-application-revision");
    return { ...result, state: "up", httpStatus, latencyMs, revision: /^[a-f0-9]{40}$/.test(revision ?? "") ? revision : null };
  }
  return { ...result, state: "down", httpStatus, latencyMs, detail: httpStatus === 200 ? "\u54CD\u5E94\u4E0D\u662F\u5065\u5EB7\u68C0\u67E5\u7ED3\u679C" : `HTTP ${httpStatus}` };
}
function summarize(endpoints) {
  const up = endpoints.filter((e) => e.state === "up").length;
  if (up === endpoints.length) return "healthy";
  if (up > 0) return "degraded";
  if (endpoints.every((e) => e.state === "gated")) return "unknown";
  return "down";
}
async function dispatch(method, input, options = {}) {
  if (method !== "health.check") throw Error("\u4E0D\u652F\u6301\u7684\u64CD\u4F5C");
  if (input && (typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)) throw Error("\u8BF7\u6C42\u53C2\u6570\u65E0\u6548");
  const fetchImpl = options.fetch ?? fetch, env = options.env ?? process.env;
  const checked = await Promise.all(instances.map(async (instance) => {
    const endpoints = await Promise.all(instance.endpoints.map((endpoint) => probe(endpoint, fetchImpl, options.now, env)));
    const services = Object.fromEntries([...new Set(endpoints.map((e) => e.service))].map((service) => [service, summarize(endpoints.filter((e) => e.service === service))]));
    return { id: instance.id, name: instance.name, status: summarize(endpoints), services, endpoints };
  }));
  return { checkedAt: (/* @__PURE__ */ new Date()).toISOString(), instances: checked };
}

// src/rpc.mjs
try {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 16384) throw Error("\u8BF7\u6C42\u8FC7\u5927");
    chunks.push(chunk);
  }
  let request;
  try {
    request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Error("\u8BF7\u6C42\u683C\u5F0F\u65E0\u6548");
  }
  if (request.version !== 1 || typeof request.method !== "string") throw Error("\u8BF7\u6C42\u534F\u8BAE\u65E0\u6548");
  const result = await dispatch(request.method, request.params ?? {});
  process.stdout.write(JSON.stringify({ version: 1, ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ version: 1, ok: false, error: { code: "instance_health_failed", message: error.message } }));
  process.exitCode = 1;
}
