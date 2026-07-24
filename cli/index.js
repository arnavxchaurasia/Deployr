#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { request } from './lib/api.js';
import { readConfig, writeConfig, getApiKey, getApiUrl } from './lib/config.js';

const program = new Command();

program
  .name('deployr')
  .description('Deploy from your terminal with Deployr')
  .version('0.1.0');

// ── helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr) {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr  / 24);

  if (diffSec < 60)  return `${diffSec}s ago`;
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHr  < 24)  return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

function statusColor(status) {
  switch (status) {
    case 'READY':        return chalk.green(status);
    case 'BUILDING':     return chalk.yellow(status);
    case 'QUEUED':       return chalk.blue(status);
    case 'FAILED':       return chalk.red(status);
    case 'NOT_DEPLOYED': return chalk.dim(status);
    default:             return chalk.dim(status ?? 'UNKNOWN');
  }
}

function padEnd(str, len) {
  const s = str ?? '';
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

// ── deployr login ─────────────────────────────────────────────────────────────

program
  .command('login')
  .description('Save your Deployr API key')
  .action(async () => {
    const existing = readConfig();

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Paste your API key (from Deployr dashboard → Settings → Keys):',
        mask: '*',
        validate: v => v.trim().length > 0 || 'API key cannot be empty',
      },
      {
        type: 'input',
        name: 'apiUrl',
        message: 'API URL (press Enter for default http://localhost:8000):',
        default: existing.apiUrl ?? 'http://localhost:8000',
      },
    ]);

    const apiKey = answers.apiKey.trim();
    const apiUrl = answers.apiUrl.trim().replace(/\/$/, '');

    // Validate the key by listing projects
    const spinner = ora('Validating API key...').start();
    try {
      // Temporarily write so request() can pick them up
      writeConfig({ ...existing, apiKey, apiUrl });

      const res = await request('/projects');
      const count = res.data?.length ?? 0;
      spinner.succeed(chalk.green(`Logged in. Found ${count} project${count !== 1 ? 's' : ''}.`));
    } catch (err) {
      writeConfig(existing); // roll back on failure
      spinner.fail(chalk.red(`Login failed: ${err.message}`));
      process.exit(1);
    }
  });

// ── deployr ls ────────────────────────────────────────────────────────────────

program
  .command('ls')
  .description('List all projects')
  .action(async () => {
    let res;
    try {
      res = await request('/projects');
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }

    const projects = res.data ?? [];

    if (projects.length === 0) {
      console.log(chalk.dim('No projects found.'));
      return;
    }

    const nameW   = 18;
    const urlW    = 36;
    const statusW = 12;

    const header =
      chalk.bold(padEnd('NAME', nameW)) +
      chalk.bold(padEnd('URL', urlW)) +
      chalk.bold(padEnd('STATUS', statusW)) +
      chalk.bold('UPDATED');

    console.log('');
    console.log('  ' + header);
    console.log('  ' + chalk.dim('─'.repeat(nameW + urlW + statusW + 10)));

    for (const p of projects) {
      const latestDeploy = p.deployments?.[0];
      const updatedAt = latestDeploy?.createdAt ?? p.createdAt;
      const url = p.liveUrl
        ? p.liveUrl.replace(/^https?:\/\//, '')
        : chalk.dim('—');

      console.log(
        '  ' +
        padEnd(p.name, nameW) +
        chalk.cyan(padEnd(url, urlW)) +
        padEnd(statusColor(p.status), statusW + 10) + // extra for chalk escape chars
        chalk.dim(formatRelative(updatedAt))
      );
    }
    console.log('');
  });

// ── deployr deploy <projectId> ────────────────────────────────────────────────

program
  .command('deploy <projectId>')
  .description('Trigger a deployment and wait for it to finish')
  .option('-b, --branch <branch>', 'Branch to deploy (default: main)')
  .action(async (projectId, opts) => {
    console.log('');
    console.log(`  Triggering deploy for project ${chalk.bold(projectId)}...`);

    let deploymentId;
    try {
      const res = await request('/deploy', {
        method: 'POST',
        body: { projectId, ...(opts.branch ? { branch: opts.branch } : {}) },
      });

      if (res.warning) {
        console.log(chalk.yellow(`  Warning: ${res.warning}`));
      }

      deploymentId = res.data?.id;
      if (!deploymentId) throw new Error('No deployment ID returned from server.');
    } catch (err) {
      console.error(chalk.red(`  Error: ${err.message}`));
      process.exit(1);
    }

    // Poll until READY or FAILED
    const spinner = ora({ text: 'Building...', indent: 2 }).start();
    const startedAt = Date.now();
    let finalStatus = null;
    let liveUrl = null;

    while (true) {
      await new Promise(r => setTimeout(r, 3000));

      let poll;
      try {
        poll = await request(`/deployment/${deploymentId}`);
      } catch (err) {
        spinner.fail(chalk.red(`  Polling error: ${err.message}`));
        process.exit(1);
      }

      const status = poll.data?.status;
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      spinner.text = `${status ?? 'Building'}... (${elapsed}s)`;

      if (status === 'READY' || status === 'FAILED') {
        finalStatus = status;
        // Fetch the project to get the live URL
        try {
          const projRes = await request(`/project/${poll.data.projectId}`);
          liveUrl = projRes.data?.liveUrl ?? null;
        } catch {
          // non-fatal — we still report the outcome
        }
        break;
      }
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);

    if (finalStatus === 'READY') {
      spinner.succeed(chalk.green(`Deploy succeeded in ${elapsed}s`));
      if (liveUrl) {
        console.log(`  → ${chalk.cyan(liveUrl)}`);
      }
    } else {
      spinner.fail(chalk.red(`Deploy failed after ${elapsed}s`));
      console.log(chalk.dim(`  Run: deployr logs ${deploymentId}`));
      process.exit(1);
    }

    console.log('');
  });

// ── deployr logs <deploymentId> ───────────────────────────────────────────────

program
  .command('logs <deploymentId>')
  .description('Print build logs for a deployment')
  .action(async (deploymentId) => {
    let res;
    try {
      res = await request(`/logs/${deploymentId}`);
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }

    const logs = res.logs ?? [];

    if (logs.length === 0) {
      console.log(chalk.dim('No logs available yet.'));
      return;
    }

    console.log('');
    for (const entry of logs) {
      const ts = new Date(entry.timestamp);
      const mm   = String(ts.getMinutes()).padStart(2, '0');
      const ss   = String(ts.getSeconds()).padStart(2, '0');
      const label = chalk.dim(`[${mm}:${ss}]`);
      console.log(`  ${label} ${entry.log}`);
    }
    console.log('');
  });

// ── deployr status <projectId> ────────────────────────────────────────────────

program
  .command('status <projectId>')
  .description('Show the latest deployment status for a project')
  .action(async (projectId) => {
    let res;
    try {
      res = await request(`/project/${projectId}`);
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }

    const p = res.data;
    if (!p) {
      console.error(chalk.red('Project not found.'));
      process.exit(1);
    }

    // Fetch the most recent deployment details
    let latestDeployment = null;
    if (p.productionDeploymentId) {
      try {
        const depRes = await request(`/deployment/${p.productionDeploymentId}`);
        latestDeployment = depRes.data;
      } catch {
        // non-fatal
      }
    }

    console.log('');
    console.log(`  ${chalk.bold('Project:')}  ${p.name}`);
    console.log(`  ${chalk.bold('Status:')}   ${statusColor(p.status)}`);
    if (latestDeployment?.branch) {
      console.log(`  ${chalk.bold('Branch:')}   ${latestDeployment.branch}`);
    }
    if (p.liveUrl) {
      console.log(`  ${chalk.bold('URL:')}      ${chalk.cyan(p.liveUrl)}`);
    }
    if (p.productionDeploymentId) {
      console.log(`  ${chalk.bold('Deploy ID:')} ${chalk.dim(p.productionDeploymentId)}`);
    }
    console.log('');
  });

program.parse(process.argv);