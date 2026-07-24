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
