'use strict';

const fs = require('fs');
const path = require('path');

// High-confidence patterns only — this scan gates every build, so false
// positives are expensive (they block a legitimate deploy). Loose heuristics
// like "any 20-char base64 string assigned to a variable named *secret*"
// are deliberately left out.
const SECRET_PATTERNS = [
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private key', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'Stripe live key', regex: /sk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z\-_]{35}/ },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.turbo', '.cache']);
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mov', '.zip', '.tar', '.gz', '.pdf', '.lock',
]);

const MAX_FILES = 5000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB — secrets don't hide in huge generated files

function walk(dir, files = [], count = { n: 0 }) {
  if (count.n >= MAX_FILES) return files;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (count.n >= MAX_FILES) break;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files, count);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;
      files.push(path.join(dir, entry.name));
      count.n++;
    }
  }

  return files;
}

/**
 * Scan a cloned repo for accidentally committed secrets before install/build
 * runs. Returns an array of { file, line, pattern } findings — empty if
 * clean. Never throws; a scan failure is logged by the caller, not treated
 * as a finding.
 *
 * @param {string} rootDir - directory the repo was cloned into
 * @returns {Array<{ file: string, line: number, pattern: string }>}
 */
function scanForSecrets(rootDir) {
  const findings = [];
  const files = walk(rootDir);

  for (const filePath of files) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_SIZE) continue;

    const relativePath = path.relative(rootDir, filePath);

    // A committed .env (not .env.example/.env.sample/.env.template) with
    // real-looking KEY=VALUE lines is the single most common accidental leak.
    const basename = path.basename(filePath);
    const isRealEnvFile = /^\.env(\.[a-z]+)?$/.test(basename) &&
      !/\.(example|sample|template)$/i.test(basename);

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue; // binary or unreadable — skip rather than false-positive on garbage
    }

    if (isRealEnvFile) {
      const hasRealValue = content.split('\n').some((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return false;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return false;
        const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        return value.length > 0 && !/^(your_|xxx|changeme|example|placeholder|<.*>)/i.test(value);
      });
      if (hasRealValue) {
        findings.push({ file: relativePath, line: null, pattern: 'Committed .env file with real-looking values' });
        continue; // don't also pattern-match every line of a file we've already flagged
      }
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const { name, regex } of SECRET_PATTERNS) {
        if (regex.test(lines[i])) {
          findings.push({ file: relativePath, line: i + 1, pattern: name });
        }
      }
    }
  }

  return findings;
}

module.exports = { scanForSecrets };
