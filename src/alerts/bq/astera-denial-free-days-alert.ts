import dotenv from 'dotenv';
dotenv.config({ override: true });

import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import { runBqAlertQuery } from '../utils/bq-query-loader';
import { SlackConfig } from '../config/slack.config';
import {
  ASTERA_BQ_SQL_FILES,
  ASTERA_RADIOLOGY_NAME,
  ASTERA_RADIOLOGY_ORG_ID,
  getAsteraInternalChannelId,
} from '../config/astera-bq-alerts.config';
import { alertContextBlock, alertHeaderBlock } from '../utils/slack-visual-blocks';
import { recordJobOutcome } from '../../cron-job-outcome';
import { getTodayIstDateKey, hasJobCompletedOnDate } from '../../scheduler-job-state';
import { RADIOLOGY_SCHEDULER_JOBS } from '../../radiology-scheduler-registry';
import { sendTestAlertsMessage } from '../../scheduler-jobs';

interface DenialFreeDaysRow {
  as_of_date: string;
  current_denial_free_days: number;
  highest_denial_free_days: number;
  highest_streak_ended_on: string | null;
  last_denial_date: string | null;
}

function defaultAsOfDateIst(): string {
  const todayKey = getTodayIstDateKey();
  const [y, m, d] = todayKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

export async function sendAsteraDenialFreeDaysAlert(asOfDate?: string): Promise<void> {
  const asOf = asOfDate ?? defaultAsOfDateIst();
  console.log(`\n📤 Astera denial-free-days streak alert (as of ${asOf} IST)...`);

  const rows = await runBqAlertQuery<DenialFreeDaysRow>(
    ASTERA_BQ_SQL_FILES.denialFreeDaysStreak,
    {
      org_id: ASTERA_RADIOLOGY_ORG_ID,
      as_of_date: asOf,
    }
  );

  const row = rows[0];
  if (!row) {
    throw new Error('Denial free days query returned no rows');
  }

  const current = row.current_denial_free_days;
  const highest = row.highest_denial_free_days;
  const lastDenial = row.last_denial_date ?? '—';
  const recordEnded = row.highest_streak_ended_on ?? '—';
  const isRecord = current > 0 && current >= highest;

  const bodyLines = [
    `*Current denial-free streak:* ${current} day${current === 1 ? '' : 's'}`,
    `*Highest denial-free streak:* ${highest} day${highest === 1 ? '' : 's'} (ended ${recordEnded})`,
    `*Last denial (IST):* ${lastDenial}`,
    isRecord ? '_🔥 Tied or beating the record streak!_' : '',
  ].filter(Boolean);

  const channelId = getAsteraInternalChannelId();
  const web = new WebClient(SlackConfig.getBotToken());
  const blocks: KnownBlock[] = [
    alertHeaderBlock(`${ASTERA_RADIOLOGY_NAME} — Denial Free Days`, '🔥'),
    alertContextBlock(`Streak through ${asOf} (IST) · denial comment dates`),
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: bodyLines.join('\n') },
    },
  ];

  await web.chat.postMessage({
    channel: channelId,
    text: `Denial free days: ${current} (record ${highest})`,
    blocks,
  });

  recordJobOutcome(
    `\`astera-denial-free-days\` → current *${current}d* / record *${highest}d* (as of ${asOf}) · <#${channelId}>`
  );
  console.log(`✓ Posted denial-free-days streak (current=${current}, record=${highest})`);
}

/** Morning digest: radiology job completion state for today (posted to #test_alerts). */
export async function sendRadiologyCronHealthDigest(): Promise<void> {
  const todayKey = getTodayIstDateKey();
  const lines: string[] = [`*Radiology cron health* (${todayKey} IST)`];

  for (const job of RADIOLOGY_SCHEDULER_JOBS) {
    const done = await hasJobCompletedOnDate(job.id, todayKey);
    const timeLabel = job.schedule.replace(/^(\d+) (\d+)/, (_, min, hour) => {
      const h = Number(hour);
      const m = Number(min);
      const h12 = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    });
    lines.push(`${done ? '✅' : '⏳'} \`${job.id}\` (${timeLabel})`);
  }

  lines.push('_Scheduled ticks every 15 min · one job per window_');
  await sendTestAlertsMessage(lines.join('\n'));
}

export async function sendAsteraDenialFreeDaysWithHealth(asOfDate?: string): Promise<void> {
  await sendAsteraDenialFreeDaysAlert(asOfDate);
  await sendRadiologyCronHealthDigest();
}
