import dotenv from 'dotenv';
dotenv.config({ override: true });
import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import { runBqAlertQuery } from '../utils/bq-query-loader';
import { getPriorIstWorkingReportDate } from '../utils/astera-workday';
import { SlackConfig } from '../config/slack.config';
import {
  ASTERA_BQ_SQL_FILES,
  ASTERA_RADIOLOGY_NAME,
  ASTERA_RADIOLOGY_ORG_ID,
  getAsteraInternalChannelId,
} from '../config/astera-bq-alerts.config';
import { alertContextBlock, alertHeaderBlock } from '../utils/slack-visual-blocks';
import {
  buildAssigneeGroupedBlocks,
  groupRowsBy,
} from '../utils/slack-copyable-table';

async function postCompactAlert(options: {
  channelId: string;
  title: string;
  emoji: string;
  subtitle: string;
  intro?: string;
  bodyBlocks: KnownBlock[];
  fallbackText: string;
}): Promise<void> {
  const web = new WebClient(SlackConfig.getBotToken());
  const blocks: KnownBlock[] = [
    alertHeaderBlock(options.title, options.emoji),
    alertContextBlock(options.subtitle),
    { type: 'divider' },
  ];
  if (options.intro) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: options.intro } });
  }
  blocks.push(...options.bodyBlocks);

  try {
    await web.chat.postMessage({
      channel: options.channelId,
      text: options.fallbackText,
      blocks: blocks.slice(0, 48),
    });
  } catch (error: unknown) {
    const slackError =
      typeof error === 'object' &&
      error !== null &&
      'data' in error &&
      typeof (error as { data?: { error?: string } }).data?.error === 'string'
        ? (error as { data: { error: string } }).data.error
        : null;
    if (slackError === 'not_in_channel') {
      throw new Error(`Bot is not in Slack channel ${options.channelId}.`);
    }
    throw error;
  }
}

interface AssignedUnworkedRow {
  mrn: string;
  assigned_to: string;
  assigned_date: string;
  days_assigned_unworked: number;
  order_id: string;
}

interface WipOverOneDayRow {
  mrn: string;
  order_id: string;
  assigned_to: string;
  first_created_date: string;
  first_wip_date: string;
  days_in_wip: number;
}

interface YesterdayAssignedUnworkedRow {
  mrn: string;
  assigned_to: string;
  assigned_date: string;
  order_id: string;
}

interface QueryReturnReallotRow {
  mrn: string;
  returned_to_status: string;
  returned_at_ist: string;
  initial_assignee: string | null;
  current_assignee: string | null;
  payer: string;
  cpt: string | null;
  order_id: string;
}

export async function sendAsteraAssignedUnworkedStreakAlert(
  reportDate?: string
): Promise<void> {
  const date = reportDate ?? (await getPriorIstWorkingReportDate());
  console.log(`\n📤 Astera assigned-unworked streak alert for ${date}...`);

  const rows = await runBqAlertQuery<AssignedUnworkedRow>(
    ASTERA_BQ_SQL_FILES.assignedUnworkedStreak,
    { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID }
  );

  if (rows.length === 0) {
    console.log('✓ No assigned-unworked streak cases — skipping Slack post');
    return;
  }

  const grouped = groupRowsBy(rows, (r) => r.assigned_to);
  const bodyBlocks = buildAssigneeGroupedBlocks(
    [...grouped.entries()].map(([assignee, items]) => ({
      assignee,
      detailLines: items.map(
        (r) =>
          `• \`${r.mrn}\` · assigned ${r.assigned_date} · *${r.days_assigned_unworked}d* unworked`
      ),
    }))
  );

  await postCompactAlert({
    channelId: getAsteraInternalChannelId(),
    title: `${ASTERA_RADIOLOGY_NAME} — Assigned but Not Worked (2+ Days)`,
    emoji: '🟠',
    subtitle: `Report date (IST): ${date} · ${rows.length} case(s)`,
    bodyBlocks,
    fallbackText: `Assigned unworked: ${rows.length} case(s)`,
  });

  console.log(`✓ Posted ${rows.length} assigned-unworked row(s)`);
}

export async function sendAsteraWipOverOneDayAlert(reportDate?: string): Promise<void> {
  const date = reportDate ?? (await getPriorIstWorkingReportDate());
  console.log(`\n📤 Astera WIP >1 day alert for ${date}...`);

  const rows = await runBqAlertQuery<WipOverOneDayRow>(ASTERA_BQ_SQL_FILES.wipOverOneDay, {
    report_date: date,
    org_id: ASTERA_RADIOLOGY_ORG_ID,
  });

  if (rows.length === 0) {
    console.log('✓ No WIP >1 day cases — skipping Slack post');
    return;
  }

  const grouped = groupRowsBy(rows, (r) => r.assigned_to || 'Unassigned');
  const bodyBlocks = buildAssigneeGroupedBlocks(
    [...grouped.entries()].map(([assignee, items]) => ({
      assignee,
      detailLines: items.map(
        (r) => `• \`${r.mrn}\` · *${r.days_in_wip}d* WIP · since ${r.first_wip_date}`
      ),
    }))
  );

  await postCompactAlert({
    channelId: getAsteraInternalChannelId(),
    title: `${ASTERA_RADIOLOGY_NAME} — Work In Progress > 1 Day`,
    emoji: '🟡',
    subtitle: `Report date (IST): ${date} · ${rows.length} case(s)`,
    bodyBlocks,
    fallbackText: `WIP >1 day: ${rows.length} case(s)`,
  });

  console.log(`✓ Posted ${rows.length} WIP row(s)`);
}

export async function sendAsteraYesterdayAssignedUnworkedAlert(
  reportDate?: string
): Promise<void> {
  const date = reportDate ?? (await getPriorIstWorkingReportDate());
  console.log(`\n📤 Astera yesterday-assigned unworked alert for ${date}...`);

  const rows = await runBqAlertQuery<YesterdayAssignedUnworkedRow>(
    ASTERA_BQ_SQL_FILES.yesterdayAssignedUnworked,
    { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID }
  );

  if (rows.length === 0) {
    console.log('✓ No yesterday-assigned unworked cases — skipping Slack post');
    return;
  }

  const grouped = groupRowsBy(rows, (r) => r.assigned_to);
  const bodyBlocks = buildAssigneeGroupedBlocks(
    [...grouped.entries()].map(([assignee, items]) => ({
      assignee,
      detailLines: items.map((r) => `• \`${r.mrn}\``),
    }))
  );

  await postCompactAlert({
    channelId: getAsteraInternalChannelId(),
    title: `${ASTERA_RADIOLOGY_NAME} — Yesterday's Assigned, Still Unworked`,
    emoji: '🔵',
    subtitle: `Assigned on (IST): ${date} · ${rows.length} case(s)`,
    intro: 'Reassign to the same assignee below.',
    bodyBlocks,
    fallbackText: `Yesterday unworked: ${rows.length} case(s)`,
  });

  console.log(`✓ Posted ${rows.length} yesterday-assigned unworked row(s)`);
}

export async function sendAsteraQueryReturnReallotAlert(reportDate?: string): Promise<void> {
  const date = reportDate ?? (await getPriorIstWorkingReportDate());
  console.log(`\n📤 Astera query-return re-allotment alert for ${date}...`);

  const rows = await runBqAlertQuery<QueryReturnReallotRow>(
    ASTERA_BQ_SQL_FILES.queryReturnReallot,
    { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID }
  );

  if (rows.length === 0) {
    console.log('✓ No query-return cases — skipping Slack post');
    return;
  }

  const grouped = groupRowsBy(rows, (r) => r.initial_assignee ?? 'Unknown');
  const bodyBlocks = buildAssigneeGroupedBlocks(
    [...grouped.entries()].map(([assignee, items]) => ({
      assignee,
      detailLines: items.map((r) => {
        const cur =
          r.current_assignee && r.current_assignee !== assignee
            ? ` · now ${r.current_assignee}`
            : '';
        return `• \`${r.mrn}\` · ${r.returned_to_status} · ${r.payer} · ${r.cpt ?? '—'}${cur}`;
      }),
    }))
  );

  await postCompactAlert({
    channelId: getAsteraInternalChannelId(),
    title: `${ASTERA_RADIOLOGY_NAME} — Query Returned, Re-allot to Initial Assignee`,
    emoji: '🟣',
    subtitle: `Returned from query on (IST): ${date} · ${rows.length} case(s)`,
    intro: 'Re-allot to the initial assignee where possible.',
    bodyBlocks,
    fallbackText: `Query return re-allot: ${rows.length} case(s)`,
  });

  console.log(`✓ Posted ${rows.length} query-return row(s)`);
}

export async function sendAllAsteraWorkloadAlerts(reportDate?: string): Promise<void> {
  const failures: string[] = [];

  for (const [name, fn] of [
    ['Assigned unworked streak', sendAsteraAssignedUnworkedStreakAlert],
    ['WIP >1 day', sendAsteraWipOverOneDayAlert],
    ['Yesterday assigned unworked', sendAsteraYesterdayAssignedUnworkedAlert],
    ['Query return re-allot', sendAsteraQueryReturnReallotAlert],
  ] as const) {
    try {
      await fn(reportDate);
    } catch (error) {
      failures.push(`${name}: ${error}`);
      console.error(`❌ ${name} failed:`, error);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

const WORKLOAD_SUBCOMMANDS = new Set([
  'assigned-unworked',
  'wip-stale',
  'yesterday-unworked',
  'query-return',
]);

async function main(): Promise<void> {
  const arg = process.argv[2];
  const dateArg = process.argv[3];
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(arg ?? '') ? arg : dateArg;

  if (arg === 'assigned-unworked') {
    await sendAsteraAssignedUnworkedStreakAlert(dateArg);
  } else if (arg === 'wip-stale') {
    await sendAsteraWipOverOneDayAlert(dateArg);
  } else if (arg === 'yesterday-unworked') {
    await sendAsteraYesterdayAssignedUnworkedAlert(dateArg);
  } else if (arg === 'query-return') {
    await sendAsteraQueryReturnReallotAlert(dateArg);
  } else if (!arg || !WORKLOAD_SUBCOMMANDS.has(arg)) {
    await sendAllAsteraWorkloadAlerts(reportDate);
  }
}

const isDirectExecution = process.argv[1]?.includes('astera-workload-alerts');
if (isDirectExecution) {
  main()
    .then(() => console.log('\n✓ Astera workload alerts completed'))
    .catch((error) => {
      console.error('\n❌ Astera workload alerts failed:', error);
      process.exit(1);
    });
}
