export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const startTime = Date.now();

    // WebSocket upgrades get their own path, bypassing cache/telemetry/
    // header-rewriting entirely — every wrapper below (withMeta, stripMeta)
    // reconstructs the Response via `new Response(response.body, {...})`,
    // which silently drops the special `webSocket` pair a 101 response
    // carries. There's nothing to cache or track latency for on a
    // long-lived connection anyway.
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return handleWebSocketProxy(request, env, host, url);
    }

    // Bypass cache for POST/PUT/DELETE
    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = await handleDynamic(request, env, ctx, host, url);
      ctx.waitUntil(trackTelemetry(request, env, response, false, Date.now() - startTime));
      return stripMeta(response);
    }

    const cache = caches.default;

    // 1. Check if the exact request is already cached at the Edge
    let response = await cache.match(request);
    let cached = true;

    if (!response) {
      cached = false;
      // 2. Not in cache, we need to process it
      response = await handleDynamic(request, env, ctx, host, url);

      // 3. Cache the response if it is successful and cacheable
      if (response && response.ok) {
        const cacheControl = response.headers.get("Cache-Control") || "";
        if (cacheControl.includes("max-age") || cacheControl.includes("s-maxage")) {
          ctx.waitUntil(cache.put(request, response.clone()));
        }
      }
    }

    ctx.waitUntil(trackTelemetry(request, env, response, cached, Date.now() - startTime));

    return stripMeta(response);
  }
}

let telemetryQueue = [];

// handleDynamic tags every response with which project/deployment served it
// (via internal headers, stripped before the client sees them) so telemetry
// records the deployment that was ACTUALLY served — including which side of
// a canary split a given request landed on — without re-resolving the host
// a second time (which could roll the canary dice differently).
const META_PROJECT_HEADER = "X-Deployr-Project";
const META_DEPLOYMENT_HEADER = "X-Deployr-Deployment";

function withMeta(response, projectId, deploymentId) {
  const headers = new Headers(response.headers);
  if (projectId) headers.set(META_PROJECT_HEADER, projectId);
  if (deploymentId) headers.set(META_DEPLOYMENT_HEADER, deploymentId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function stripMeta(response) {
  if (!response.headers.has(META_PROJECT_HEADER) && !response.headers.has(META_DEPLOYMENT_HEADER)) return response;
  const headers = new Headers(response.headers);
  headers.delete(META_PROJECT_HEADER);
  headers.delete(META_DEPLOYMENT_HEADER);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function trackTelemetry(request, env, response, cached, latencyMs) {
  try {
    const projectId = response?.headers?.get(META_PROJECT_HEADER);
    if (!projectId) return; // Nothing was resolved (e.g. 404 before routing) — nothing to attribute

    const url = new URL(request.url);

    const contentLength = response.headers.get("Content-Length");

    telemetryQueue.push({
      projectId,
      deploymentId: response.headers.get(META_DEPLOYMENT_HEADER) || null,
      path: url.pathname,
      status: response.status,
      latencyMs,
      cached,
      bytes: contentLength ? parseInt(contentLength, 10) : 0,
      country: request.cf?.country || null,
      city: request.cf?.city || null,
    });

    if (telemetryQueue.length >= 10) {
      const batch = [...telemetryQueue];
      telemetryQueue = [];
      await fetch(`${env.API_BASE}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch)
      });
    }
  } catch (e) {
    // Fail silently, telemetry should not break the app
  }
}

// Proxies a WebSocket upgrade straight through to the resolved deployment's
// function origin. Requires the origin itself to support persistent
// connections — a plain AWS Lambda Function URL request/response backend
// won't hold a WebSocket open, this just gets the tunnel to the origin;
// whether the origin can sustain it is the operator's infrastructure choice,
// same caveat as custom Docker builds needing their own CodeBuild setup.
async function handleWebSocketProxy(request, env, host, url) {
  try {
    const resolveRes = await fetch(`${env.API_BASE}/resolve/${host}`);
    if (!resolveRes.ok) return new Response('Project not found or not deployed', { status: 404 });

    const { functionUrl, functionUrls, maintenance } = await resolveRes.json();
    if (maintenance) return new Response('Service unavailable', { status: 503 });

    let targetBase = functionUrl;
    let subPath = url.pathname;
    if (functionUrls && url.pathname.startsWith('/api/')) {
      const rest = url.pathname.slice('/api/'.length);
      const fnName = rest.split('/')[0];
      if (functionUrls[fnName]) {
        targetBase = functionUrls[fnName];
        subPath = rest.slice(fnName.length);
      }
    }

    if (!targetBase) return new Response('This deployment has no server to upgrade a WebSocket connection to', { status: 501 });

    const targetUrl = `${targetBase.replace(/\/$/, '')}${subPath}${url.search}`;
    return await fetch(targetUrl, request);
  } catch (err) {
    return new Response('WebSocket proxy failed: ' + err.message, { status: 502 });
  }
}

async function handleDynamic(request, env, ctx, host, url) {
  const API_BASE = env.API_BASE;
  const S3_BASE = "https://vercel-clone-ws.s3.us-east-1.amazonaws.com/__outputs";
  const cache = caches.default;

  // Hoisted so the top-level catch can still serve a project's custom 500
  // page even if the failure happens after resolution.
  let resolved = null;

  try {
    // --- RESOLVE HOST ---
    const resolveUrl = `${API_BASE}/resolve/${host}`;
    const resolveReq = new Request(resolveUrl);
    
    let resolveRes = await cache.match(resolveReq);
    if (!resolveRes) {
      resolveRes = await fetch(resolveReq);
      if (resolveRes.ok) {
        // Cache DNS resolution for 60 seconds
        const clonedRes = new Response(resolveRes.clone().body, resolveRes);
        clonedRes.headers.set("Cache-Control", "s-maxage=60");
        ctx.waitUntil(cache.put(resolveReq, clonedRes));
      }
    }

    if (!resolveRes.ok) {
      return new Response("Project not found or not deployed", { status: 404 });
    }

    resolved = await resolveRes.json();
    const {
      projectId, deploymentId, functionUrl, functionUrls, protected: isProtected, maintenance, message,
      custom404Html, custom500Html, redirectRules, headerRules, geoRules, rateLimitPerMinute, botProtection, compressionMode,
      experiments,
    } = resolved;

    if (maintenance) {
      return withMeta(maintenancePage(message), projectId, null);
    }

    // --- GEO RULES ---
    if (geoRules && Array.isArray(geoRules.countries) && geoRules.countries.length) {
      const country = request.cf?.country || null;
      const listed = !!country && geoRules.countries.includes(country);
      const blocked = geoRules.mode === 'block' ? listed : geoRules.mode === 'allow' ? !listed : false;
      if (blocked) {
        return withMeta(geoBlockedPage(), projectId, deploymentId);
      }
    }

    // --- BOT PROTECTION (heuristic — see Project.botProtection schema comment) ---
    if (botProtection?.mode === 'block' && isLikelyBot(request, botProtection)) {
      return withMeta(botBlockedPage(), projectId, deploymentId);
    }

    // --- RATE LIMIT (best-effort, per-colo — see rateLimitPerMinute schema comment) ---
    if (rateLimitPerMinute) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const limited = await isRateLimited(ctx, projectId, ip, rateLimitPerMinute);
      if (limited) {
        return withMeta(
          new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } }),
          projectId, deploymentId
        );
      }
    }

    let path = url.pathname;

    // --- IMAGE RESIZING ---
    if (path === IMAGE_RESIZE_PATH) {
      return withMeta(await handleImageResize(request, url, projectId, deploymentId, S3_BASE), projectId, deploymentId);
    }

    // --- REDIRECTS & REWRITES ---
    if (Array.isArray(redirectRules) && redirectRules.length) {
      const match = matchRedirectRule(path, redirectRules);
      if (match) {
        if (match.type === 'redirect') {
          return withMeta(
            new Response(null, { status: match.statusCode || 302, headers: { Location: match.resolvedDestination } }),
            projectId, deploymentId
          );
        }
        // Rewrite — serve a different path transparently, URL bar unchanged.
        path = match.resolvedDestination;
      }
    }

    // --- A/B TESTING ---
    // Assign (or read) a persistent per-visitor variant for each active
    // experiment, optionally rewrite `path` per variant, and fire
    // exposure/conversion beacons — see runExperiments() for the full
    // mechanics. No app code required for path-rewrite-based tests.
    const { newCookies, variantHeaders } = runExperiments(request, path, experiments, API_BASE, ctx, (rewritten) => { path = rewritten; });

    const applyHeaders = (response) => applyExperimentAssignment(
      applyCompressionMode(applyHeaderRules(response, path, headerRules), compressionMode),
      newCookies, variantHeaders
    );

    const isStaticAsset = path.startsWith('/_next/static/') || path.match(/\.(png|jpe?g|gif|svg|ico|css|js|woff2?)$/i);

    // --- PREVIEW DEPLOYMENT PROTECTION ---
    if (isProtected) {
      const gate = await handlePreviewProtection(request, env, url, path, projectId);
      if (gate) return gate;
    }

    // --- USER FUNCTIONS (functions/<name>.js -> /api/<name>) ---
    if (functionUrls && path.startsWith('/api/')) {
      const rest = path.slice('/api/'.length);
      const fnName = rest.split('/')[0];
      const fnBaseUrl = functionUrls[fnName];
      if (fnBaseUrl) {
        const subPath = rest.slice(fnName.length);
        const targetUrl = `${fnBaseUrl.replace(/\/$/, '')}${subPath}${url.search}`;
        const newReq = new Request(targetUrl, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        const fnRes = await fetch(newReq);
        if (fnRes.status === 404 || fnRes.status >= 500) {
          return withMeta(applyHeaders(errorPage(fnRes.status, fnRes.status === 404 ? custom404Html : custom500Html)), projectId, deploymentId);
        }
        return withMeta(applyHeaders(fnRes), projectId, deploymentId);
      }
    }

    // --- LAMBDA SSR ---
    if (functionUrl && !isStaticAsset && path !== "/favicon.ico") {
      const targetUrl = `${functionUrl.replace(/\/$/, '')}${path}${url.search}`;
      const newReq = new Request(targetUrl, {
          method: request.method,
          headers: request.headers,
          body: request.body,
      });
      let proxyRes = await fetch(newReq);

      if (proxyRes.status === 404 || proxyRes.status >= 500) {
        return withMeta(applyHeaders(errorPage(proxyRes.status, proxyRes.status === 404 ? custom404Html : custom500Html)), projectId, deploymentId);
      }

      // Pass through the response (cache will automatically pick up upstream Cache-Control)
      return withMeta(applyHeaders(proxyRes), projectId, deploymentId);
    }

    // --- S3 STATIC ASSETS ---
    if (path === "/") {
      path = "/index.html";
    }

    const targetUrl = `${S3_BASE}/${projectId}/${deploymentId}${path}`;
    const assetRes = await fetch(targetUrl);

    if (!assetRes.ok) {
      return withMeta(applyHeaders(errorPage(404, custom404Html)), projectId, deploymentId);
    }

    // Inject heavy caching headers for S3 assets since they are immutable per deployment ID
    const headers = new Headers(assetRes.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return withMeta(applyHeaders(new Response(assetRes.body, {
      status: assetRes.status,
      headers: headers,
    })), projectId, deploymentId);

  } catch (err) {
    return errorPage(500, resolved?.custom500Html);
  }
}

// Serves a project's custom 404/500 HTML if configured, otherwise Deployr's
// built-in animated error page. `customHtml` is trusted here — it's
// sanitized (script tags stripped) once at save time in the API server,
// not on every request.
function errorPage(status, customHtml) {
  if (customHtml) {
    return new Response(customHtml, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response(defaultErrorPage(status), { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function defaultErrorPage(status) {
  const is404 = status === 404;
  const title = is404 ? "Page not found" : "Something went wrong";
  const sub = is404
    ? "The page you're looking for doesn't exist or may have moved."
    : "The server hit an unexpected error. Try refreshing in a moment.";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${status} — ${title}</title>
  <style>
    html,body{height:100%;margin:0}
    body{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      background:#0b0b0f;color:#f4f4f5;text-align:center;padding:0 20px;
    }
    .orb-wrap{position:relative;width:160px;height:160px;margin-bottom:32px}
    .orb{
      position:absolute;border-radius:50%;
      background:radial-gradient(circle at 30% 30%, #818cf8, #4f46e5 60%, #1e1b4b);
      box-shadow:0 0 60px 10px rgba(99,102,241,0.45);
      animation:float 3.2s ease-in-out infinite;
    }
    .orb.a{width:160px;height:160px;top:0;left:0;opacity:0.9}
    .orb.b{width:60px;height:60px;top:70px;left:120px;background:radial-gradient(circle at 30% 30%, #f472b6, #db2777 60%, #4a044e);animation-delay:-1.1s;animation-duration:2.6s}
    .orb.c{width:34px;height:34px;top:10px;left:110px;background:radial-gradient(circle at 30% 30%, #34d399, #059669 60%, #022c22);animation-delay:-2s;animation-duration:3.8s}
    @keyframes float{
      0%,100%{transform:translateY(0) translateX(0)}
      33%{transform:translateY(-14px) translateX(6px)}
      66%{transform:translateY(8px) translateX(-8px)}
    }
    h1{font-size:1.6rem;margin:0 0 8px;font-weight:700}
    p{margin:0;color:#a1a1aa;font-size:0.95rem;max-width:360px}
    .code{margin-top:20px;font-size:0.75rem;letter-spacing:0.08em;color:#52525b;text-transform:uppercase}
  </style></head>
  <body>
    <div class="orb-wrap">
      <div class="orb a"></div>
      <div class="orb b"></div>
      <div class="orb c"></div>
    </div>
    <h1>${title}</h1>
    <p>${sub}</p>
    <div class="code">Error ${status}</div>
  </body></html>`;
}

// Matches `path` against a rule's `source` — exact match, or a "/*" prefix
// wildcard whose remainder is substituted for "$1" in the destination.
// Returns the first matching rule (in array order) with its destination
// resolved, or null.
function matchRedirectRule(path, rules) {
  for (const rule of rules) {
    if (!rule?.source || !rule?.destination) continue;
    if (rule.source.endsWith('/*')) {
      const prefix = rule.source.slice(0, -2);
      if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length);
        return { ...rule, resolvedDestination: rule.destination.replace('$1', rest) };
      }
    } else if (path === rule.source) {
      return { ...rule, resolvedDestination: rule.destination };
    }
  }
  return null;
}

// Merges any headerRules whose `source` matches `path` (same exact/"/*"
// matching as redirects) onto the response. Later-matching rules win on
// conflicting header names, mirroring array order = priority order.
function applyHeaderRules(response, path, headerRules) {
  if (!Array.isArray(headerRules) || !headerRules.length) return response;

  const extra = {};
  for (const rule of headerRules) {
    if (!rule?.source || !rule?.headers) continue;
    const matches = rule.source.endsWith('/*')
      ? path.startsWith(rule.source.slice(0, -2))
      : path === rule.source;
    if (matches) Object.assign(extra, rule.headers);
  }
  if (!Object.keys(extra).length) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// When a project disables compression, append the standard `no-transform`
// Cache-Control directive — the HTTP-level signal that tells any
// intermediary (Cloudflare's own edge included) not to alter the response
// body, which is what actually suppresses automatic gzip/Brotli encoding.
// "auto" (the default) leaves whatever Cache-Control the origin/asset
// already set untouched.
function applyCompressionMode(response, compressionMode) {
  if (compressionMode !== 'disabled') return response;

  const headers = new Headers(response.headers);
  const existing = headers.get('Cache-Control');
  headers.set('Cache-Control', existing ? `${existing}, no-transform` : 'no-transform');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return cookies;
}

function pickWeightedVariant(variants) {
  const total = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
  let roll = Math.random() * total;
  for (const v of variants) {
    roll -= v.weight || 1;
    if (roll <= 0) return v;
  }
  return variants[variants.length - 1];
}

// Runs every active experiment for this request: reads (or assigns) a
// persistent per-visitor variant via cookie, optionally rewrites the served
// path for that variant via `setPath`, and schedules exposure/conversion
// beacons to the API. Conversion is a simple "did this already-assigned
// visitor hit goalPath" check — a directional signal, not a statistically
// rigorous test.
function runExperiments(request, path, experiments, API_BASE, ctx, setPath) {
  const newCookies = [];
  const variantHeaders = {};
  if (!Array.isArray(experiments) || !experiments.length) return { newCookies, variantHeaders };

  const cookies = parseCookies(request);
  const originalPath = path;

  const postEvent = (experimentId, variant, type) =>
    fetch(`${API_BASE}/experiments/${experimentId}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant, type }),
    }).catch(() => {});

  for (const experiment of experiments) {
    const variantList = Array.isArray(experiment.variants) ? experiment.variants : [];
    if (variantList.length < 2) continue;

    const cookieName = `dplr_ab_${experiment.key}`;
    const existingKey = cookies[cookieName];
    let variant = variantList.find((v) => v.key === existingKey);
    const isNewAssignment = !variant;
    if (!variant) variant = pickWeightedVariant(variantList);

    if (isNewAssignment) {
      newCookies.push(`${cookieName}=${encodeURIComponent(variant.key)}; Path=/; Max-Age=31536000; SameSite=Lax`);
      ctx.waitUntil(postEvent(experiment.id, variant.key, 'exposure'));
    }

    variantHeaders[`X-Deployr-Experiment-${experiment.key}`] = variant.key;

    if (variant.pathOverride) setPath(variant.pathOverride);

    if (experiment.goalPath && originalPath === experiment.goalPath) {
      ctx.waitUntil(postEvent(experiment.id, variant.key, 'conversion'));
    }
  }

  return { newCookies, variantHeaders };
}

function applyExperimentAssignment(response, newCookies, variantHeaders) {
  if (!newCookies.length && !Object.keys(variantHeaders).length) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(variantHeaders)) headers.set(name, value);
  for (const cookie of newCookies) headers.append('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Best-effort rate limiting: a per-colo counter kept in the Cache API,
// bucketed by minute. Not a global/exact limiter (each Cloudflare colo has
// its own count) — it throttles sustained abuse from one region rather than
// guaranteeing a precise worldwide cap. Good enough without provisioning a
// Durable Object/KV namespace for it.
async function isRateLimited(ctx, projectId, ip, limitPerMinute) {
  const cache = caches.default;
  const bucket = Math.floor(Date.now() / 60000);
  const counterKey = new Request(`https://ratelimit.internal/${projectId}/${encodeURIComponent(ip)}/${bucket}`);

  let count = 0;
  const existing = await cache.match(counterKey);
  if (existing) count = parseInt(await existing.text(), 10) || 0;
  count++;

  ctx.waitUntil(cache.put(counterKey, new Response(String(count), { headers: { "Cache-Control": "max-age=65" } })));

  return count > limitPerMinute;
}

function geoBlockedPage() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Not available in your region</title>
    <style>body{font-family:sans-serif;max-width:420px;margin:20vh auto;padding:0 16px;text-align:center;color:#333}
    h1{font-size:1.4em}</style></head>
    <body><h1>Not available in your region</h1><p>This site isn't accessible from your location.</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Heuristic bot check, not a Turnstile/CAPTCHA challenge — see Project.botProtection
// schema comment. Cloudflare's own bot score (request.cf.botManagement.score,
// 1-99, lower = more bot-like) is only populated on plans with Bot
// Management; the UA-based checks work on every plan as a fallback.
function isLikelyBot(request, botProtection) {
  const ua = request.headers.get('User-Agent') || '';

  if (botProtection.blockEmptyUserAgent && !ua.trim()) return true;

  if (Array.isArray(botProtection.blockedUserAgents)) {
    const uaLower = ua.toLowerCase();
    if (botProtection.blockedUserAgents.some((needle) => needle && uaLower.includes(needle.toLowerCase()))) {
      return true;
    }
  }

  const botScore = request.cf?.botManagement?.score;
  if (typeof botScore === 'number' && typeof botProtection.maxBotScore === 'number' && botScore <= botProtection.maxBotScore) {
    return true;
  }

  return false;
}

function botBlockedPage() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Access denied</title>
    <style>body{font-family:sans-serif;max-width:420px;margin:20vh auto;padding:0 16px;text-align:center;color:#333}
    h1{font-size:1.4em}</style></head>
    <body><h1>Access denied</h1><p>Automated traffic isn't permitted on this site.</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// --- IMAGE RESIZING ---
// GET /_deployr/image?src=/photo.jpg&w=800&q=75&fit=cover&format=auto —
// resizes an image from this deployment's own static assets on the fly via
// Cloudflare's Image Resizing (the `cf.image` fetch option). Requires the
// zone this worker runs on to have Image Resizing enabled (a Cloudflare
// Pro+/add-on feature) — same "operator must configure their own
// infrastructure" pattern as codeBuildService.js's Docker builds. If the
// zone doesn't have it enabled, `cf.image` is silently ignored by
// Cloudflare and the original, unresized image is returned instead of
// erroring — so this degrades gracefully rather than breaking image loads.
const IMAGE_RESIZE_PATH = '/_deployr/image';

async function handleImageResize(request, url, projectId, deploymentId, S3_BASE) {
  const src = url.searchParams.get('src');
  if (!src || !src.startsWith('/')) {
    return new Response('Missing or invalid "src" query parameter', { status: 400 });
  }

  const width = parseInt(url.searchParams.get('w'), 10);
  const quality = parseInt(url.searchParams.get('q'), 10);
  const fit = url.searchParams.get('fit') || 'scale-down';
  const format = url.searchParams.get('format') || 'auto';

  const targetUrl = `${S3_BASE}/${projectId}/${deploymentId}${src}`;

  const imageOptions = { fit, format };
  if (Number.isFinite(width) && width > 0) imageOptions.width = width;
  if (Number.isFinite(quality) && quality > 0 && quality <= 100) imageOptions.quality = quality;

  const resized = await fetch(targetUrl, { cf: { image: imageOptions } });

  const headers = new Headers(resized.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(resized.body, { status: resized.status, headers });
}

const PROTECTION_COOKIE = "deployr_preview_auth";
const PROTECTION_PATH = "/__deployr_protection";

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Mirrors api-server's previewProtectionService token format/signing exactly
// so the worker can verify a session cookie itself, without a per-request
// round trip to the API.
async function verifyProtectionToken(token, projectId, secret) {
  if (!token || !secret) return false;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return false;

  let payload;
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    payload = atob(b64);
  } catch {
    return false;
  }

  const expected = await hmacHex(secret, payload);
  if (expected !== sig) return false;

  const [tokenProjectId, expStr] = payload.split(".");
  const exp = parseInt(expStr, 10);
  return tokenProjectId === projectId && Number.isFinite(exp) && Date.now() < exp;
}

function maintenancePage(message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Down for maintenance</title>
    <style>body{font-family:sans-serif;max-width:420px;margin:20vh auto;padding:0 16px;text-align:center;color:#333}
    h1{font-size:1.4em}</style></head>
    <body>
      <h1>We'll be right back</h1>
      <p>${message ? message.replace(/</g, "&lt;") : "This site is temporarily down for maintenance."}</p>
    </body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "300" } }
  );
}

function loginPage(path, error) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Password Protected</title>
    <style>body{font-family:sans-serif;max-width:360px;margin:15vh auto;padding:0 16px}
    input{width:100%;padding:10px;margin:8px 0;box-sizing:border-box}
    button{width:100%;padding:10px;cursor:pointer}
    .err{color:#c0392b;font-size:14px}</style></head>
    <body>
      <h2>This preview is password protected</h2>
      ${error ? `<p class="err">${error}</p>` : ""}
      <form method="POST" action="${PROTECTION_PATH}">
        <input type="hidden" name="redirect" value="${path}" />
        <input type="password" name="password" placeholder="Password" autofocus />
        <button type="submit">Continue</button>
      </form>
    </body></html>`,
    { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Returns a Response to short-circuit the request (login page, redirect
// after a correct password, or an error) — or null if the caller already
// holds a valid session and the request should proceed normally.
async function handlePreviewProtection(request, env, url, path, projectId) {
  const secret = env.PREVIEW_PROTECTION_SECRET;

  if (path === PROTECTION_PATH && request.method === "POST") {
    const form = await request.formData();
    const password = form.get("password") || "";
    const redirectPath = form.get("redirect") || "/";

    const verifyRes = await fetch(`${env.API_BASE}/protection/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, password }),
    });

    if (!verifyRes.ok) {
      return loginPage(redirectPath, "Incorrect password. Try again.");
    }

    const { token } = await verifyRes.json();
    const headers = new Headers({ Location: redirectPath });
    headers.append(
      "Set-Cookie",
      `${PROTECTION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`
    );
    return new Response(null, { status: 302, headers });
  }

  const cookie = getCookie(request, PROTECTION_COOKIE);
  const valid = await verifyProtectionToken(cookie, projectId, secret);
  if (valid) return null;

  return loginPage(path + (url.search || ""));
}
