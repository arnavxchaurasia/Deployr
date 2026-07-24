import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.deployr');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function readConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(data) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function getApiKey() {
  return readConfig().apiKey ?? null;
}

export function getApiUrl() {
  return readConfig().apiUrl ?? 'http://localhost:8000';
}
