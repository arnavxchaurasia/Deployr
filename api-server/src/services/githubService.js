'use strict';

const https = require('https');

const GITHUB_API_HOST = 'api.github.com';

const DEFAULT_HEADERS = {
  'User-Agent': 'Deployr-Platform/1.0',
  'Accept': 'application/vnd.github.v3+json',
};

/**
 * Make an HTTPS request to the GitHub API.
 * @param {string} path - API path, e.g. "/user/repos?per_page=100"
 * @param {object} options - Additional https.request options (method, headers, etc.)
 * @param {string|null} body - Request body for POST/PATCH/PUT (JSON string)
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
function githubRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: GITHUB_API_HOST,
      port: 443,
      path,
      method: options.method || 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        ...(options.headers || {}),
      },
    };

    if (body) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = raw;
        }
        resolve({ statusCode: res.statusCode, data });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Fetch the authenticated user's GitHub repositories (public + private).
 * Calls GET /user/repos?per_page=100&sort=updated&type=all
 *
 * @param {string} githubToken - GitHub Personal Access Token
 * @returns {Promise<Array<{id, name, full_name, private, default_branch, html_url, description, updated_at}>>}
 *   Returns empty array on failure.
 */
async function listUserRepos(githubToken) {
  try {
    const { statusCode, data } = await githubRequest(
      '/user/repos?per_page=100&sort=updated&type=all',
      {
        headers: {
          Authorization: `token ${githubToken}`,
        },
      }
    );

    if (statusCode !== 200 || !Array.isArray(data)) {
      return [];
    }

    return data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      default_branch: repo.default_branch,
      html_url: repo.html_url,
      description: repo.description || null,
      updated_at: repo.updated_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch and decode the raw package.json from a GitHub repository.
 * Calls GET /repos/{owner}/{repo}/contents/package.json?ref={branch}
 *
 * @param {string} owner - GitHub repo owner (e.g. "facebook")
 * @param {string} repo - Repo name (e.g. "react")
 * @param {string} branch - Branch name (e.g. "main")
 * @param {string} githubToken - GitHub Personal Access Token
 * @returns {Promise<object|null>} Parsed package.json object, or null if not found / parse error.
 */
async function getPackageJson(owner, repo, branch, githubToken) {
  try {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json?ref=${encodeURIComponent(branch)}`;
    const { statusCode, data } = await githubRequest(path, {
      headers: {
        Authorization: `token ${githubToken}`,
      },
    });

    if (statusCode !== 200 || !data || !data.content) {
      return null;
    }

    // GitHub returns base64-encoded content with newlines embedded
    const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Detect the JavaScript framework from a parsed package.json and return
 * the suggested build configuration.
 *
 * @param {object} packageJson - Parsed package.json object
 * @returns {{ framework: string, buildCommand: string, outputDir: string, installCommand: string }}
 */
function detectFramework(packageJson) {
  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};
  const allDeps = { ...deps, ...devDeps };

  // Priority order matters — check more specific frameworks first.

  if (deps['next']) {
    return {
      framework: 'Next.js',
      buildCommand: 'npm run build',
      outputDir: '.next',
      installCommand: 'npm ci',
    };
  }

  if (deps['@remix-run/node'] || deps['@remix-run/react']) {
    return {
      framework: 'Remix',
      buildCommand: 'npm run build',
      outputDir: 'build',
      installCommand: 'npm ci',
    };
  }

  if (deps['astro'] || devDeps['astro']) {
    return {
      framework: 'Astro',
      buildCommand: 'npm run build',
      outputDir: 'dist',
      installCommand: 'npm ci',
    };
  }

  if (deps['@sveltejs/kit'] || devDeps['@sveltejs/kit']) {
    return {
      framework: 'SvelteKit',
      buildCommand: 'npm run build',
      outputDir: '.svelte-kit',
      installCommand: 'npm ci',
    };
  }

  if (deps['nuxt'] || deps['nuxt3'] || devDeps['nuxt'] || devDeps['nuxt3']) {
    return {
      framework: 'Nuxt',
      buildCommand: 'npm run build',
      outputDir: '.nuxt',
      installCommand: 'npm ci',
    };
  }

  if (deps['react-scripts']) {
    return {
      framework: 'Create React App',
      buildCommand: 'npm run build',
      outputDir: 'build',
      installCommand: 'npm ci',
    };
  }

  // Vite check comes after CRA since CRA projects shouldn't match here
  if (devDeps['vite'] || deps['vite']) {
    return {
      framework: 'Vite',
      buildCommand: 'npm run build',
      outputDir: 'dist',
      installCommand: 'npm ci',
    };
  }

  if (deps['vue'] || devDeps['vue']) {
    return {
      framework: 'Vue.js',
      buildCommand: 'npm run build',
      outputDir: 'dist',
      installCommand: 'npm ci',
    };
  }

  return {
    framework: 'Unknown',
    buildCommand: 'npm run build',
    outputDir: 'dist',
    installCommand: 'npm ci',
  };
}

/**
 * Fetch the raw content of a file from a GitHub repository.
 * Calls GET /repos/{owner}/{repo}/contents/{filePath}?ref={branch}
 *
 * @param {string} owner - GitHub repo owner
 * @param {string} repo - Repo name
 * @param {string} filePath - Path to the file inside the repo (e.g. "turbo.json")
 * @param {string} githubToken - GitHub Personal Access Token
 * @param {string} [branch='main'] - Branch name
 * @returns {Promise<string|null>} Raw decoded file content, or null if not found.
 */
async function getFileContent(owner, repo, filePath, githubToken, branch = 'main') {
  try {
    const apiPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
    const { statusCode, data } = await githubRequest(apiPath, {
      headers: {
        Authorization: `token ${githubToken}`,
      },
    });

    if (statusCode !== 200 || !data || !data.content) {
      return null;
    }

    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Detect whether a GitHub repository is a monorepo by checking for
 * turbo.json, nx.json, or pnpm-workspace.yaml in the repo root.
 *
 * @param {string} owner - GitHub repo owner
 * @param {string} repo - Repo name
 * @param {string} githubToken - GitHub Personal Access Token
 * @param {string} [branch='main'] - Branch name
 * @returns {Promise<{ isMonorepo: boolean, type: string|null }>}
 */
async function detectMonorepo(owner, repo, githubToken, branch = 'main') {
  const [turboContent, nxContent, pnpmContent] = await Promise.all([
    getFileContent(owner, repo, 'turbo.json', githubToken, branch),
    getFileContent(owner, repo, 'nx.json', githubToken, branch),
    getFileContent(owner, repo, 'pnpm-workspace.yaml', githubToken, branch),
  ]);

  const hasTurbo = turboContent !== null;
  const hasNx = nxContent !== null;
  const hasPnpmWorkspace = pnpmContent !== null;

  const isMonorepo = hasTurbo || hasNx || hasPnpmWorkspace;
  const type = hasTurbo ? 'turborepo' : hasNx ? 'nx' : hasPnpmWorkspace ? 'pnpm-workspaces' : null;

  return { isMonorepo, type };
}

/**
 * Post a comment on a GitHub Pull Request.
 * Calls POST /repos/{owner}/{repo}/issues/{prNumber}/comments
 *
 * @param {string} owner - GitHub repo owner
 * @param {string} repo - Repo name
 * @param {number} prNumber - PR number
 * @param {string} body - Markdown comment body
 * @param {string} githubToken - GitHub Personal Access Token
 * @returns {Promise<boolean>} true on success, false on failure (never throws)
 */
async function postPRComment(owner, repo, prNumber, body, githubToken) {
  try {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${prNumber}/comments`;
    const payload = JSON.stringify({ body });

    const { statusCode } = await githubRequest(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${githubToken}`,
        },
      },
      payload
    );

    // GitHub returns 201 Created on success
    return statusCode === 201;
  } catch {
    return false;
  }
}

/**
 * Validate a GitHub Personal Access Token by calling GET /user.
 *
 * @param {string} token - GitHub PAT to validate
 * @returns {Promise<{ valid: boolean, login: string|null }>}
 */
async function validateGitHubToken(token) {
  try {
    const { statusCode, data } = await githubRequest('/user', {
      headers: {
        Authorization: `token ${token}`,
      },
    });

    if (statusCode === 200 && data && data.login) {
      return { valid: true, login: data.login };
    }

    return { valid: false, login: null };
  } catch {
    return { valid: false, login: null };
  }
}

module.exports = {
  listUserRepos,
  getPackageJson,
  detectFramework,
  getFileContent,
  detectMonorepo,
  postPRComment,
  validateGitHubToken,
};