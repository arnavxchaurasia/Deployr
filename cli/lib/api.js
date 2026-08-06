import fetch from 'node-fetch';
import { getApiKey, getApiUrl } from './config.js';

export async function request(path, { method = 'GET', body } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('Not logged in. Run: deployr login');
    process.exit(1);
  }

  const url = `${getApiUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Opens a Server-Sent Events connection and invokes onEvent(eventName, data)
// for each event received. Resolves once the stream ends (server closes it,
// e.g. on terminal deployment status) or the returned abort() is called.
export async function streamRequest(path, onEvent) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('Not logged in. Run: deployr login');
    process.exit(1);
  }

  const controller = new AbortController();
  const url = `${getApiUrl()}${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: controller.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  let buffer = '';
  for await (const chunk of res.body) {
    buffer += chunk.toString('utf8');

    let sepIndex;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      let eventName = 'message';
      let dataLine = '';
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7);
        else if (line.startsWith('data: ')) dataLine = line.slice(6);
      }
      if (!dataLine) continue; // heartbeat/comment line

      let data;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }
      onEvent(eventName, data);
    }
  }

  return { abort: () => controller.abort() };
}
