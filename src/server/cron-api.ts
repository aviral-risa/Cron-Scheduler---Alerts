import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { CLOUD_SCHEDULER_JOBS } from '../cloud-scheduler-registry';
import {
  getCurrentISTTime,
  isScheduledJobId,
  runScheduledJobById,
  type ScheduledJobId,
} from '../scheduler-jobs';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

app.use(express.json());

function isAuthorized(req: express.Request): boolean {
  // Cloud Run with IAM auth: only Cloud Scheduler (OIDC) reaches this handler
  if (process.env.K_SERVICE) {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.get('X-Cron-Secret') === cronSecret) {
    return true;
  }

  if (process.env.CRON_ALLOW_UNAUTHENTICATED === 'true' && process.env.NODE_ENV !== 'production') {
    return true;
  }

  return false;
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'account-management-cron',
    timeIST: getCurrentISTTime(),
    jobs: CLOUD_SCHEDULER_JOBS.length,
  });
});

app.get('/jobs', (_req, res) => {
  res.json({
    timezone: 'Asia/Kolkata',
    jobs: CLOUD_SCHEDULER_JOBS,
  });
});

app.post('/cron/:jobId', async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { jobId } = req.params;
  if (!isScheduledJobId(jobId)) {
    res.status(404).json({ error: `Unknown job: ${jobId}` });
    return;
  }

  const startedAt = new Date().toISOString();
  console.log(`\n☁️ Cloud cron triggered: ${jobId} at ${getCurrentISTTime()} IST`);

  try {
    await runScheduledJobById(jobId as ScheduledJobId);
    res.json({
      status: 'ok',
      jobId,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`❌ Cloud cron failed (${jobId}):`, error);
    res.status(500).json({
      status: 'error',
      jobId,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }
});

app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('☁️  Account Management Dashboard — Cloud Cron API');
  console.log('='.repeat(70));
  console.log(`   Listening on port ${PORT}`);
  console.log(`   Jobs registered: ${CLOUD_SCHEDULER_JOBS.length}`);
  console.log(`   Time: ${getCurrentISTTime()} IST`);
  console.log('='.repeat(70));
});
