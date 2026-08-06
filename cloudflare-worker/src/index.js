export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const startTime = Date.now();
    
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
      custom404Html, custom500Html, redirectRules, headerRules, geoRules, rateLimitPerMinute,
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

    const applyHeaders = (response) => applyHeaderRules(response, path, headerRules);

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
