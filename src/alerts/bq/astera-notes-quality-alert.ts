import dotenv from 'dotenv';
dotenv.config({ override: true });
import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import { runBqAlertQuery } from '../utils/bq-query-loader';
import { getTodayIstDate } from '../utils/report-dates';
import { SlackConfig } from '../config/slack.config';
import {
  ASTERA_BQ_SQL_FILES,
  ASTERA_RADIOLOGY_NAME,
  ASTERA_RADIOLOGY_ORG_ID,
  getAsteraInternalChannelId,
} from '../config/astera-bq-alerts.config';
import { alertContextBlock, alertHeaderBlock } from '../utils/slack-visual-blocks';
import { buildAssigneeGroupedBlocks, groupRowsBy } from '../utils/slack-copyable-table';
import { postAsteraZeroCaseAlert, recordAsteraRowOutcome } from '../utils/astera-empty-alert';
import {
  auditNoteRows,
  formatIssueLine,
  type NoteAuditRow,
} from '../utils/astera-notes-validator';

async function postCompactAlert(options: {
  channelId: string;
  title: string;
  emoji: string;
  subtitle: string;
  bodyBlocks: KnownBlock[];
  fallbackText: string;
}): Promise<void> {
  const web = new WebClient(SlackConfig.getBotToken());
  const blocks: KnownBlock[] = [
    alertHeaderBlock(options.title, options.emoji),
    alertContextBlock(options.subtitle),
    { type: 'divider' },
    ...options.bodyBlocks,
  ];
  await web.chat.postMessage({
    channel: options.channelId,
    text: options.fallbackText,
    blocks: blocks.slice(0, 48),
  });
}

function mapBqRow(raw: Record<string, unknown>): NoteAuditRow {
  return {
    audit_kind: raw.audit_kind === 'missing_paste' ? 'missing_paste' : 'pasted',
    comment_id: raw.comment_id != null ? String(raw.comment_id) : null,
    order_id: String(raw.order_id ?? ''),
    mrn: String(raw.mrn ?? ''),
    assigned_to: raw.assigned_to != null ? String(raw.assigned_to) : null,
    provider_name: raw.provider_name != null ? String(raw.provider_name) : null,
    note_text: raw.note_text != null ? String(raw.note_text) : null,
    template_text: raw.template_text != null ? String(raw.template_text) : null,
    master_auth_status: raw.master_auth_status != null ? String(raw.master_auth_status) : null,
    bo_status: raw.bo_status != null ? String(raw.bo_status) : null,
    prev_master_auth_status:
      raw.prev_master_auth_status != null ? String(raw.prev_master_auth_status) : null,
    wip_business_days:
      raw.wip_business_days != null && raw.wip_business_days !== ''
        ? Number(raw.wip_business_days)
        : null,
  };
}

export async function sendAsteraOncoNotesQualityAlert(
  reportDate?: string,
  channelId = getAsteraInternalChannelId()
): Promise<void> {
  const date = reportDate ?? getTodayIstDate();
  console.log(`\n🔍 Astera OncoEMR notes quality audit for ${date} (IST)...`);

  const rawRows = await runBqAlertQuery<Record<string, unknown>>(
    ASTERA_BQ_SQL_FILES.oncoNotesAudit,
    { report_date: date, org_id: ASTERA_RADIOLOGY_ORG_ID }
  );
  const rows = rawRows.map(mapBqRow);
  const pastedCount = rows.filter((r) => r.audit_kind === 'pasted').length;
  const findings = auditNoteRows(rows);
  const missingCount = findings.filter((f) =>
    f.issues.some((i) => i.code === 'missing_onco_paste')
  ).length;
  const pastedIssues = findings.filter((f) => f.row.audit_kind === 'pasted').length;

  console.log(
    `   Reviewed ${pastedCount} pasted note(s), ${rows.length - pastedCount} template-only row(s); ${findings.length} flagged`
  );

  if (findings.length === 0) {
    await postAsteraZeroCaseAlert({
      jobId: 'astera-onco-notes-quality',
      title: `${ASTERA_RADIOLOGY_NAME} — OncoEMR Notes Quality`,
      emoji: '✅',
      reportDate: date,
      channelId,
      detail: `${pastedCount} note(s) reviewed · all passed template and status checks`,
    });
    recordAsteraRowOutcome('astera-onco-notes-quality', 0, date, channelId);
    return;
  }

  const pastedSection = findings.filter((f) => f.row.audit_kind === 'pasted');
  const missingSection = findings.filter((f) => f.row.audit_kind === 'missing_paste');

  const bodyBlocks: KnownBlock[] = [];

  if (pastedSection.length > 0) {
    const pastedGrouped = groupRowsBy(pastedSection, (f) =>
      f.row.provider_name ?? f.row.assigned_to ?? 'Unassigned'
    );
    bodyBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Pasted notes with issues (${pastedIssues})*`,
      },
    });
    bodyBlocks.push(
      ...buildAssigneeGroupedBlocks(
        [...pastedGrouped.entries()].map(([assignee, items]) => ({
          assignee,
          detailLines: items.map(formatIssueLine),
        }))
      )
    );
  }

  if (missingSection.length > 0) {
    if (pastedSection.length > 0) {
      bodyBlocks.push({ type: 'divider' });
    }
    const missingGrouped = groupRowsBy(missingSection, (f) =>
      f.row.assigned_to ?? 'Unassigned'
    );
    bodyBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Template generated but not pasted (${missingCount})*`,
      },
    });
    bodyBlocks.push(
      ...buildAssigneeGroupedBlocks(
        [...missingGrouped.entries()].map(([assignee, items]) => ({
          assignee,
          detailLines: items.map(formatIssueLine),
        }))
      )
    );
  }

  await postCompactAlert({
    channelId,
    title: `${ASTERA_RADIOLOGY_NAME} — OncoEMR Notes Quality`,
    emoji: '🔍',
    subtitle: `${date} (IST) · ${pastedCount} pasted · ${missingCount} missing paste · ${findings.length} flagged`,
    bodyBlocks,
    fallbackText: `${ASTERA_RADIOLOGY_NAME} notes quality | ${findings.length} flagged`,
  });

  recordAsteraRowOutcome('astera-onco-notes-quality', findings.length, date, channelId);
  console.log(`✓ Posted ${findings.length} flagged note row(s)`);
}

async function main(): Promise<void> {
  const dateArg = process.argv[2];
  const channelArg = process.argv[3];
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(dateArg ?? '') ? dateArg : undefined;
  await sendAsteraOncoNotesQualityAlert(reportDate, channelArg ?? getAsteraInternalChannelId());
}

const isDirectExecution = process.argv[1]?.includes('astera-notes-quality-alert');
if (isDirectExecution) {
  main()
    .then(() => console.log('\n✓ Astera notes quality alert completed'))
    .catch((error) => {
      console.error('\n❌ Astera notes quality alert failed:', error);
      process.exit(1);
    });
}
