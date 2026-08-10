'use strict';

const RULES = [
  {
    id: 'aws_access_key',
    name: 'AWS Access Key ID',
    severity: 'HIGH',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    id: 'aws_secret_key',
    name: 'AWS Secret Access Key',
    severity: 'HIGH',
    pattern: /aws[_-]?secret[_-]?(?:access[_-]?)?key['"]?\s*[:=]\s*['"]?([A-Za-z0-9/+]{40})/i,
  },
  {
    id: 'github_token',
    name: 'GitHub Token',
    severity: 'HIGH',
    pattern: /(?:ghp_|ghs_|github_pat_)[A-Za-z0-9_]{20,}/,
  },
  {
    id: 'stripe_live_key',
    name: 'Stripe Live Key',
    severity: 'CRITICAL',
    pattern: /(?:sk_live_|pk_live_)[A-Za-z0-9]{24,}/,
  },
  {
    id: 'slack_token',
    name: 'Slack Token',
    severity: 'HIGH',
    pattern: /xox[bp]-[A-Za-z0-9-]{10,}/,
  },
  {
    id: 'generic_api_key',
    name: 'Generic API Key',
    severity: 'MEDIUM',
    pattern: /api[_-]?key['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-]{16,})['"]/i,
  },
  {
    id: 'private_key_pem',
    name: 'Private Key (PEM)',
    severity: 'CRITICAL',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    id: 'jwt_token',
    name: 'JSON Web Token',
    severity: 'MEDIUM',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    id: 'database_url',
    name: 'Database Connection URL',
    severity: 'HIGH',
    pattern: /(?:postgres|mysql|mongodb\+srv):\/\/[^:]+:[^@]+@[^\s'"]+/i,
  },
  {
    id: 'heroku_api_key',
    name: 'Heroku API Key',
    severity: 'HIGH',
    pattern: /heroku[_-]?(?:api[_-]?)?key['"]?\s*[:=]\s*['"]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  },
  {
    id: 'twilio_auth_token',
    name: 'Twilio Auth Token',
    severity: 'HIGH',
    pattern: /twilio[_-]?(?:auth[_-]?)?token['"]?\s*[:=]\s*['"]?([a-f0-9]{32})/i,
  },
  {
    id: 'sendgrid_key',
    name: 'SendGrid API Key',
    severity: 'HIGH',
    pattern: /SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}/,
  },
];

function redact(value) {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

/**
 * Scan a text string for secrets.
 * @param {string} text
 * @param {string} location
 * @returns {{ ruleId: string, severity: string, redacted: string, location: string }[]}
 */
function scanText(text, location) {
  const results = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      const raw = match[1] || match[0];
      results.push({
        ruleId: rule.id,
        severity: rule.severity,
        redacted: redact(raw),
        location,
      });
    }
  }
  return results;
}

/**
 * Scan env var keys (not encrypted values) for suspicious patterns.
 * @param {Record<string, string>} envVars  key → (encrypted) value
 * @returns {{ ruleId: string, severity: string, redacted: string, location: string }[]}
 */
function scanEnvVars(envVars) {
  const results = [];
  for (const key of Object.keys(envVars)) {
    const hits = scanText(key, `env_var:${key}`);
    results.push(...hits);
  }
  return results;
}

module.exports = { scanText, scanEnvVars, RULES };
