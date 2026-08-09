'use strict';

const crypto = require('crypto');

// Relays an inbound HTTP request to whichever CLI socket is registered for
// this tunnel id, over the existing Socket.io connection (the same server
// build-log streaming already uses — no separate tunnel infra needed).
// `pendingRequests` is a Map<requestId, {resolve, reject}> that the
// socket's `tunnel:response` handler (wired in index.js) resolves against.
const pendingRequests = new Map();
const REQUEST_TIMEOUT_MS = 20_000;

function resolvePendingRequest(requestId, payload) {
  const pending = pendingRequests.get(requestId);
  if (!pending) return; // already timed out, or a stale/duplicate response
  pendingRequests.delete(requestId);
  pending.resolve(payload);
}

// Returns { statusCode, headers, bodyBase64 } from the CLI's local server,
// or throws if no tunnel client is connected / it doesn't respond in time.
function relayTunnelRequest(io, tunnelId, { method, path, headers, bodyBase64 }) {
  const room = `tunnel:${tunnelId}`;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  if (!roomSockets || roomSockets.size === 0) {
    return Promise.reject(new Error('No tunnel client connected for this id'));
  }

  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Tunnel client did not respond in time'));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      resolve: (payload) => { clearTimeout(timer); resolve(payload); },
    });

    io.to(room).emit('tunnel:request', { requestId, method, path, headers, bodyBase64 });
  });
}

module.exports = { relayTunnelRequest, resolvePendingRequest };
