const { prisma } = require('../../lib/prisma');

// Parse cron expression → next run check (simple: check if current time matches)
// Uses a basic field matching approach — minute, hour, day, month, weekday
function matchesCron(expression, now) {
  const parts = expression.trim().split(/\s+/);
  // Support 5-field standard cron: min hour dom month dow
  const [min, hour, dom, month, dow] = parts.slice(-5);

  function match(field, value) {
    if (field === '*') return true;
    if (field.includes('/')) {
      const [, step] = field.split('/');
      return value % parseInt(step, 10) === 0;
    }
    if (field.includes(',')) return field.split(',').map(Number).includes(value);
    if (field.includes('-')) {
      const [lo, hi] = field.split('-').map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(field, 10) === value;
  }

  return (
    match(min,   now.getMinutes()) &&
    match(hour,  now.getHours()) &&
    match(dom,   now.getDate()) &&
    match(month, now.getMonth() + 1) &&
    match(dow,   now.getDay())
  );
}

async function runDueJobs() {
  const now = new Date();
  const jobs = await prisma.cronJob.findMany({
    where: { enabled: true },
    include: { project: { select: { deployHookToken: true, slug: true } } },
  });

  for (const job of jobs) {
    if (!matchesCron(job.expression, now)) continue;

    let status = 'success';
    try {
      if (job.useHook && job.project.deployHookToken) {
        const hookUrl = `${process.env.API_URL || 'http://localhost:9000'}/hooks/${job.project.deployHookToken}`;
        const res = await fetch(hookUrl, { method: 'POST' });
        if (!res.ok) status = 'failed';
      } else if (job.endpoint) {
        const res = await fetch(job.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, projectSlug: job.project.slug, timestamp: now.toISOString() }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) status = 'failed';
      }
    } catch {
      status = 'failed';
    }

    await prisma.cronJob.update({
      where: { id: job.id },
      data: { lastRunAt: now, lastStatus: status },
    }).catch(() => {});
  }
}

function startCronExecutor() {
  // Run every minute at the start of the minute
  const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000;
  setTimeout(() => {
    runDueJobs().catch(console.error);
    setInterval(() => runDueJobs().catch(console.error), 60_000);
  }, msUntilNextMinute);

  console.log('[CronExecutor] Started — first tick in', Math.round(msUntilNextMinute / 1000), 's');
}

module.exports = { startCronExecutor };
