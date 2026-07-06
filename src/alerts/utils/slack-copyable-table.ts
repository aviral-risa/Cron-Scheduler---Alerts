import type { KnownBlock } from '@slack/web-api';
import { caseCardBlock } from './slack-visual-blocks';

/** @deprecated Use buildCaseListBlocks or buildCompactListBlocks */
export function buildCopyableTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '_No rows._';
  }

  const escape = (value: string) => (value ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ');
  const lines = [
    headers.map(escape).join('\t'),
    ...rows.map((row) => headers.map((_, i) => escape(row[i] ?? '')).join('\t')),
  ];

  return '```\n' + lines.join('\n') + '\n```';
}

export function truncateCell(value: string, max = 48): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Denials — expanded case cards with field layout */
export function buildCaseListBlocks(
  cases: Array<{
    title: string;
    fields: Array<{ label: string; value: string }>;
    footer?: string;
  }>
): KnownBlock[] {
  if (cases.length === 0) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: '_No rows._' } }];
  }

  const blocks = cases.flatMap((c, i) =>
    caseCardBlock({
      index: i + 1,
      title: c.title,
      fields: c.fields,
      footer: c.footer,
    })
  );

  if (blocks.length > 0 && blocks[blocks.length - 1].type === 'divider') {
    blocks.pop();
  }

  return blocks;
}

const MAX_LINES_PER_SECTION = 22;
const MAX_SECTION_CHARS = 2900;

/** Workload / ops lists — one bullet per row, minimal vertical space */
export function buildCompactListBlocks(lines: string[]): KnownBlock[] {
  if (lines.length === 0) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: '_No rows._' } }];
  }

  const blocks: KnownBlock[] = [];
  let chunk: string[] = [];
  let chunkChars = 0;

  const flush = () => {
    if (chunk.length === 0) {
      return;
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk.join('\n') } });
    chunk = [];
    chunkChars = 0;
  };

  for (const line of lines) {
    if (chunk.length >= MAX_LINES_PER_SECTION || chunkChars + line.length > MAX_SECTION_CHARS) {
      flush();
    }
    chunk.push(line);
    chunkChars += line.length + 1;
  }
  flush();
  return blocks;
}

/** Re-allotment alerts — rows clustered under assignee */
export function buildAssigneeGroupedBlocks(
  groups: Array<{ assignee: string; detailLines: string[] }>
): KnownBlock[] {
  return groups.map((g) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${g.assignee}* (${g.detailLines.length})\n${g.detailLines.join('\n')}`,
    },
  }));
}

export function groupRowsBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row) || 'Unassigned';
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
