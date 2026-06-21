export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const startTime = Date.now();
    
    // Bypass cache for POST/PUT/DELETE
    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = await handleDynamic(request, env, ctx, host, url);
      ctx.waitUntil(trackTelemetry(request, env, host, response.status, false, Date.now() - startTime));
      return response;
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
    
    ctx.waitUntil(trackTelemetry(request, env, host, response ? response.status : 500, cached, Date.now() - startTime));
    
    return response;
  }
}

async function trackTelemetry(request, env, host, status, cached, latencyMs) {
  try {
    const cache = caches.default;
    const resolveUrl = `${env.API_BASE}/resolve/${host}`;
    let resolveRes = await cache.match(new Request(resolveUrl));
    
    if (!resolveRes) {
      resolveRes = await fetch(resolveUrl);
    }
    
    if (!resolveRes.ok) return; // Cannot track if project not found
    
    const { projectId } = await resolveRes.json();
    const url = new URL(request.url);
    
    const payload = {
      projectId,
      path: url.pathname,
      status,
      latencyMs,
      cached,
      country: request.cf?.country || null,
      city: request.cf?.city || null
    };

    await fetch(`${env.API_BASE}/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // Fail silently, telemetry should not break the app
  }
}

async function handleDynamic(request, env, ctx, host, url) {
  const API_BASE = env.API_BASE;
  const S3_BASE = "https://vercel-clone-ws.s3.us-east-1.amazonaws.com/__outputs";
  const cache = caches.default;

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

    const { projectId, deploymentId, functionUrl } = await resolveRes.json();
    
    let path = url.pathname;
    const isStaticAsset = path.startsWith('/_next/static/') || path.match(/\.(png|jpe?g|gif|svg|ico|css|js|woff2?)$/i);

    // --- LAMBDA SSR ---
    if (functionUrl && !isStaticAsset && path !== "/favicon.ico") {
      const targetUrl = `${functionUrl.replace(/\/$/, '')}${path}${url.search}`;
      const newReq = new Request(targetUrl, {
          method: request.method,
          headers: request.headers,
          body: request.body,
      });
      let proxyRes = await fetch(newReq);
      
      // Pass through the response (cache will automatically pick up upstream Cache-Control)
      return proxyRes;
    }

    // --- S3 STATIC ASSETS ---
    if (path === "/") {
      path = "/index.html";
    }
    
    const targetUrl = `${S3_BASE}/${projectId}/${deploymentId}${path}`;
    const assetRes = await fetch(targetUrl);
    
    if (!assetRes.ok) {
      return new Response("Asset not found", { status: 404 });
    }
    
    // Inject heavy caching headers for S3 assets since they are immutable per deployment ID
    const headers = new Headers(assetRes.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    
    return new Response(assetRes.body, {
      status: assetRes.status,
      headers: headers,
    });
    
  } catch (err) {
    return new Response("Internal Server Error: " + err.message, { status: 500 });
  }
}
