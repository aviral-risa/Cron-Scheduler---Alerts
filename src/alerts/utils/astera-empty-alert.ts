import type { KnownBlock } from '@slack/web-api';
import { WebClient } from '@slack/web-api';
import { SlackConfig } from '../config/slack.config';
import { getAsteraInternalChannelId } from '../config/astera-bq-alerts.config';
import { alertContextBlock, alertHeaderBlock } from './slack-visual-blocks';
import { recordJobOutcome } from '../../cron-job-outcome';

/** Post a visible "0 cases" confirmation to #astera-radiology and record for cron summary. */
export async function postAsteraZeroCaseAlert(options: {
  jobId: string;
  title: string;
  emoji: string;
  reportDate: string;
  channelId?: string;
}): Promise<void> {
  const channelId = options.channelId ?? getAsteraInternalChannelId();
  const web = new WebClient(SlackConfig.getBotToken());
  const blocks: KnownBlock[] = [
    alertHeaderBlock(options.title, options.emoji),
    alertContextBlock(`Report date: ${options.reportDate} · 0 case(s)`),
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '_No cases for this report date — all clear._' },
    },
  ];

  await web.chat.postMessage({
    channel: channelId,
    text: `${options.title}: 0 cases`,
    blocks,
  });

  recordJobOutcome(
    `\`${options.jobId}\` → *0 cases* (${options.reportDate}) · posted to <#${channelId}>`
  );
  console.log(`✓ Posted 0-case confirmation to ${channelId}`);
}

export function recordAsteraRowOutcome(
  jobId: string,
  rowCount: number,
  reportDate: string,
  channelId: string
): void {
  recordJobOutcome(
    `\`${jobId}\` → *${rowCount} case(s)* (${reportDate}) · posted to <#${channelId}>`
  );
}
