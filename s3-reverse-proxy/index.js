const express = require("express");
const http = require("http");
const httpProxy = require("http-proxy");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8000;

const S3_BASE = process.env.S3_BASE || "https://vercel-clone-ws.s3.us-east-1.amazonaws.com/__outputs";
const API_BASE = process.env.API_BASE || "http://localhost:9000";
const SOCKET_BASE = process.env.SOCKET_BASE || "http://localhost:9002";

const resolveCache = new Map();
const RESOLVE_TTL = 30 * 1000;

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/* ------------------------------------------------
   Helper: Parse Cookie Header manually
------------------------------------------------ */
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (let c of cookies) {
    const [key, val] = c.trim().split("=");
    if (key === name) return val;
  }
  return null;
}

/* ------------------------------------------------
   Proxy setup (WITH WEBSOCKET SUPPORT)
------------------------------------------------ */
const proxy = httpProxy.createProxy({
  ws: true,
  changeOrigin: true,
});

/* ------------------------------------------------
   WebSocket upgrade handling
------------------------------------------------ */
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/socket.io")) {
    proxy.ws(req, socket, head, {
      target: SOCKET_BASE,
    });
    return;
  }

  socket.destroy();
});

/* ------------------------------------------------
   HTTP routing
------------------------------------------------ */
app.use(async (req, res) => {
  try {
    if (req.url.startsWith("/socket.io")) {
      proxy.web(req, res, {
        target: SOCKET_BASE,
      });
      return;
    }

    let subdomain = null;
    let deployment = null;

    // Parse URL to check for project and deployment query params
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const queryProject = urlObj.searchParams.get("project");
    const queryDeployment = urlObj.searchParams.get("deployment");

    if (queryProject) {
      subdomain = queryProject;
      deployment = queryDeployment || null;

      const cookiesToSet = [`current_project=${subdomain}; Path=/; HttpOnly`];
      if (deployment) {
        cookiesToSet.push(`current_deployment=${deployment}; Path=/; HttpOnly`);
      } else {
        cookiesToSet.push(`current_deployment=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`);
      }
      res.setHeader("Set-Cookie", cookiesToSet);
    } else {
      const cookieProject = getCookie(req, "current_project");
      if (cookieProject) {
        subdomain = cookieProject;
        deployment = getCookie(req, "current_deployment") || null;
      } else {
        const host = req.hostname.toLowerCase();
        const parts = host.split(".");
        if (parts.length >= 3) {
          subdomain = parts[0];
        }
      }
    }

    if (!subdomain) {
      return res.status(400).send("No project selected. Specify a subdomain or a ?project= query parameter.");
    }

    // Resolve project + deployment via subdomain and deployment (using query params)
    const cacheKey = `${subdomain}:${deployment || 'latest'}`;
    const cached = resolveCache.get(cacheKey);
    let projectId, deploymentId;

    if (cached && Date.now() - cached.ts < RESOLVE_TTL) {
      projectId = cached.data.projectId;
      deploymentId = cached.data.deploymentId;
    } else {
      let resolveUrl = `${API_BASE}/resolve/${subdomain}`;
      if (deployment) {
        resolveUrl += `?deployment=${deployment}`;
      }
      const resolveRes = await axios.get(resolveUrl);
      projectId = resolveRes.data.projectId;
      deploymentId = resolveRes.data.deploymentId;
      resolveCache.set(cacheKey, { ts: Date.now(), data: { projectId, deploymentId } });
    }
    const target = `${S3_BASE}/${projectId}/${deploymentId}`;

    const startTime = Date.now();

    res.on("finish", () => {
      if (req.url.match(/\.(js|css|ico|png|jpg|jpeg|svg|woff2?)$/i)) return;

      const latencyMs = Date.now() - startTime;
      
      axios.post(`${API_BASE}/track`, {
        projectId,
        path: req.url,
        status: res.statusCode,
        latencyMs,
        cached: res.getHeader("x-cache") === "Hit from cloudfront"
      }).catch(() => {});
    });

    proxy.web(req, res, {
      target,
    });
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(404).send("Project not found or not deployed");
  }
});

/* ------------------------------------------------
   Fix root index.html
------------------------------------------------ */
proxy.on("proxyReq", (proxyReq, req) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (urlObj.pathname === "/") {
    const queryIndex = proxyReq.path.indexOf("?");
    if (queryIndex !== -1) {
      proxyReq.path =
        proxyReq.path.slice(0, queryIndex) +
        "index.html" +
        proxyReq.path.slice(queryIndex);
    } else {
      proxyReq.path += "index.html";
    }
  }
});

server.listen(PORT, () => {
  console.log(
    `Reverse proxy running on http://localhost:${PORT}`
  );
});
