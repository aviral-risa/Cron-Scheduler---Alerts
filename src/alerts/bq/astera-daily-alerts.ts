import dotenv from 'dotenv';
dotenv.config({ override: true });
import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import { runBqAlertQuery } from '../utils/bq-query-loader';
import {
  getAuthmateReportDate,
  shouldRunAuthmatePendingAlert,
} from '../utils/report-dates';
import { getPriorIstWorkingReportDate } from '../utils/astera-workday';
import { SlackConfig } from '../config/slack.config';
import {
  ASTERA_BQ_SQL_FILES,
  ASTERA_RADIOLOGY_NAME,
  ASTERA_RADIOLOGY_ORG_ID,
  getAsteraGroupChannelId,
  getAsteraInternalChannelId,
} from '../config/astera-bq-alerts.config';
import { analyzeDenial, formatDenialChecklistForSlack } from '../utils/denial-analyzer';
import { alertContextBlock, alertHeaderBlock } from '../utils/slack-visual-blocks';
import { buildAssigneeGroupedBlocks, buildCaseListBlocks, groupRowsBy, truncateCell } from '../utils/slack-copyable-table';

interface DenialInternalRow {
  order_id: string;
  mrn: string;
  regimen_name: string | null;
  cpt_code: string | null;
  denial_note: string;
  denial_preview: string;
  denial_summary: string;
  assigned_to: string;
  denial_date: string;
  query_before_denial: boolean;
  query_notes: string | null;
}

interface DenialGroupRow {
  order_id: string;
  mrn: string;
  regimen_name: string | null;
  cpt_code: string | null;
  denial_preview: string;
  denial_summary?: string;
  denial_note: string;
  denial_date?: string;
  assigned_to?: string;
}

interface AuthmatePendingRow {
  mrn: string;
  assigned_to: string | null;
  last_note_triggered_on: string | null;
  missed_dates: string;
  missed_day_count: number;
  pending_since: string;
}

async function postSlackMessage(options: {
  channelId: string;
  blocks: KnownBlock[];
  text: string;
  threadTs?: string;
}): Promise<string | undefined> {
  const web = new WebClient(SlackConfig.getBotToken());
  try {
    const result = await web.chat.postMessage({
      channel: options.channelId,
      text: options.text,
      blocks: options.blocks.slice(0, 48),
      thread_ts: options.threadTs,
    });
    return result.ts;
  } catch (error: unknown) {
    const slackError =
      typeof error === 'object' &&
      error !== null &&
      'data' in error &&
      typeof (error as { data?: { error?: string } }).data?.error === 'string'
        ? (error as { data: { error: string } }).data.error
        : null;

    if (slackError === 'not_in_channel') {
      throw new Error(
        `Bot is not in Slack channel ${options.channelId}. Invite the bot to #test-alerts.`
      );
    }
    throw error;
  }
}

async function postDenialTableAlert(options: {
  title: string;
  subtitle: string;
  rows: DenialInternalRow[] | DenialGroupRow[];
  channelId: string;
  includeCouldHaveSaved: boolean;
  emptyMessage: string;
}): Promise<void> {
  if (options.rows.length === 0) {
    await postSlackMessage({
      channelId: options.channelId,
      text: options.emptyMessage,
      blocks: [
        alertHeaderBlock(options.title, '🔴'),
        alertContextBlock(options.subtitle),
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: options.emptyMessage } },
      ],
    });
    return;
  }

  const caseBlocks = buildCaseListBlocks(
    options.rows.map((row) => {
      const internal = row as DenialInternalRow;
      const analysis = options.includeCouldHaveSaved
        ? analyzeDenial({
            denialNote: internal.denial_note,
            cptCodes: internal.cpt_code,
            queryBeforeDenial: internal.query_before_denial,
          })
        : null;
      return {
        title: `MRN ${row.mrn}`,
        fields: [
          { label: 'Regimen', value: internal.regimen_name ?? row.regimen_name ?? '—' },
          { label: 'Denial Date', value: internal.denial_date ?? '—' },
          { label: 'CPT', value: row.cpt_code ?? '—' },
          { label: 'Assigned To', value: internal.assigned_to ?? '—' },
        ],
        footer: analysis
          ? truncateCell(analysis.payer_cited_gaps[0] ?? internal.denial_summary ?? row.denial_preview ?? '', 120)
          : truncateCell(internal.denial_summary ?? row.denial_preview ?? '', 120),
      };
    })
  );

  const parentTs = await postSlackMessage({
    channelId: options.channelId,
    text: `${options.title} | ${options.rows.length} denial(s)`,
    blocks: [
      alertHeaderBlock(options.title, '🔴'),
      alertContextBlock(options.subtitle),
      { type: 'divider' },
      ...caseBlocks,
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: options.includeCouldHaveSaved
              ? '_What the payer said was missing + full denial letters in thread ↓_'
              : '_Full denial letters in thread ↓_',
          },
        ],
      },
    ],
  });

  if (!parentTs) {
    return;
  }

  const web = new WebClient(SlackConfig.getBotToken());

  if (options.includeCouldHaveSaved) {
    const tips = options.rows.map((row, i) => {
      const internal = row as DenialInternalRow;
      const analysis = analyzeDenial({
        denialNote: internal.denial_note,
        cptCodes: internal.cpt_code,
        queryBeforeDenial: internal.query_before_denial,
      });
      return `*${i + 1}. MRN ${row.mrn}* · ${row.regimen_name ?? '—'} · CPT ${row.cpt_code ?? '—'}\n${formatDenialChecklistForSlack(analysis)}`;
    });
    await web.chat.postMessage({
      channel: options.channelId,
      thread_ts: parentTs,
      text: 'What the payer said was missing',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: tips.join('\n\n'),
          },
        },
      ],
    });
  }

  for (const row of options.rows) {
    const internal = row as DenialInternalRow;
    await web.chat.postMessage({
      channel: options.channelId,
      thread_ts: parentTs,
      text: `MRN ${row.mrn} — full denial`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*MRN ${row.mrn}* · ${row.regimen_name ?? '—'} · CPT ${row.cpt_code ?? '—'} · ${internal.denial_date ?? ''}\n\n${internal.denial_note.slice(0, 2900)}`,
          },
        },
      ],
    });
  }
}

export async function sendAsteraDenialInternalAlert(reportDate?: string): Promise<void> {
  const date = reportDate ?? (await getPriorIstWorkingReportDate());
  console.log(`\n📤 Astera denial internal alert for ${date}...`);

  const rows = await runBqAlertQuery<DenialInternalRow>(ASTERA_BQ_SQL_FILES.denialInternal, {
    report_date: date,
    org_id: ASTERA_RADIOLOGY_ORG_ID,
  });

  await postDenialTableAlert({
    title: `${ASTERA_RADIOLOGY_NAME} — Daily Denial List (Internal)`,
    subtitle: `Report date (IST): ${date}`,
    rows,
    channelId: getAsteraInternalChannelId(),
    includeCouldHaveSaved: true,
    emptyMessage: 'No denial notes logged for this IST date.',
  });

  console.log(`✓ Posted ${rows.length} denial row(s) to internal channel`);
}

export async function sendAsteraDenialGroupAlert(reportDate?: string): Promise<void> {
  const date = reportDate ?? (await getPriorIstWorkingReportDate());
  console.log(`\n📤 Astera denial group alert for ${date}...`);

  const rows = await runBqAlertQuery<DenialGroupRow>(ASTERA_BQ_SQL_FILES.denialGroup, {
    report_date: date,
    org_id: ASTERA_RADIOLOGY_ORG_ID,
  });

  await postDenialTableAlert({
    title: `${ASTERA_RADIOLOGY_NAME} — Daily Denial List (Group)`,
    subtitle: `Report date (IST): ${date} | MRN + summary only`,
    rows,
    channelId: getAsteraGroupChannelId(),
    includeCouldHaveSaved: false,
    emptyMessage: 'No denial notes logged for this IST date.',
  });

  console.log(`✓ Posted ${rows.length} denial row(s) to group channel`);
}

export async function sendAsteraAuthmatePendingMissedNotesAlert(
  reportDate?: string,
  channelIdOverride?: string
): Promise<void> {
  const date = reportDate ?? getAuthmateReportDate();
  console.log(`\n📤 Astera AuthMate-Pending missed notes alert for ${date} (EST business day)...`);

  const rows = await runBqAlertQuery<AuthmatePendingRow>(
    ASTERA_BQ_SQL_FILES.authmatePendingMissedNotes,
    {
      report_date: date,
      org_id: ASTERA_RADIOLOGY_ORG_ID,
    }
  );

  if (rows.length === 0) {
    console.log('✓ No missed-note cases for this EST business day — skipping Slack post');
    return;
  }

  const grouped = groupRowsBy(rows, (r) => r.assigned_to ?? 'Unassigned');
  const bodyBlocks = buildAssigneeGroupedBlocks(
    [...grouped.entries()].map(([assignee, items]) => ({
      assignee,
      detailLines: items.map((r) => {
        const n = r.missed_day_count;
        const label = n === 1 ? '1 followup missed' : `${n} followups missed`;
        return `• \`${r.mrn}\` · *${label}* · pending since ${r.pending_since}`;
      }),
    }))
  );

  const channelId = channelIdOverride ?? getAsteraInternalChannelId();
  await postSlackMessage({
    channelId,
    text: `${ASTERA_RADIOLOGY_NAME} AuthMate-Pending | ${rows.length} case(s)`,
    blocks: [
      alertHeaderBlock(`${ASTERA_RADIOLOGY_NAME} — AuthMate-Pending Missed Notes`, '🟣'),
      alertContextBlock(
        `Missed EST weekday: ${date} · ${rows.length} case(s) · weekdays since pending start`
      ),
      { type: 'divider' },
      ...bodyBlocks,
    ],
  });

  console.log(`✓ Posted ${rows.length} missed-note row(s)`);
}

export async function sendAllAsteraBqDailyAlerts(reportDate?: string): Promise<void> {
  const failures: string[] = [];

  try {
    await sendAsteraDenialInternalAlert(reportDate);
  } catch (error) {
    failures.push(`Denial internal: ${error}`);
    console.error('❌ Denial internal alert failed:', error);
  }

  if (reportDate || shouldRunAuthmatePendingAlert()) {
    try {
      await sendAsteraAuthmatePendingMissedNotesAlert(reportDate);
    } catch (error) {
      failures.push(`AuthMate-Pending missed notes: ${error}`);
      console.error('❌ AuthMate-Pending missed notes alert failed:', error);
    }
  } else {
    console.log('ℹ️ Skipping AuthMate-Pending alert — today is an EST weekend');
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

const DAILY_SUBCOMMANDS = new Set(['denial-internal', 'denial-group', 'authmate-pending']);

async function main(): Promise<void> {
  const arg = process.argv[2];
  const dateArg = process.argv[3];
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '') ? arg : dateArg;

  if (arg === 'denial-internal') {
    await sendAsteraDenialInternalAlert(dateArg);
  } else if (arg === 'denial-group') {
    await sendAsteraDenialGroupAlert(dateArg);
  } else if (arg === 'authmate-pending') {
    const channelArg = process.argv[4];
    await sendAsteraAuthmatePendingMissedNotesAlert(dateArg, channelArg);
  } else if (!arg || !DAILY_SUBCOMMANDS.has(arg)) {
    await sendAllAsteraBqDailyAlerts(reportDate);
  }
}

const isDirectExecution = process.argv[1]?.includes('astera-daily-alerts');
if (isDirectExecution) {
  main()
    .then(() => console.log('\n✓ Astera BQ daily alerts completed'))
    .catch((error) => {
      console.error('\n❌ Astera BQ daily alerts failed:', error);
      process.exit(1);
    });
}
