import type { Block, KnownBlock } from '@slack/web-api';

export function alertHeaderBlock(title: string, emoji = '📋'): KnownBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text: `${emoji} ${title}`, emoji: true },
  };
}

export function alertContextBlock(subtitle: string): KnownBlock {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: subtitle }],
  };
}

export function summaryStatsBlock(stats: Array<{ label: string; value: string | number }>): KnownBlock {
  const lines = stats.map((s) => `*${s.label}:* ${s.value}`).join('  ·  ');
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: lines },
  };
}

export function caseCardBlock(options: {
  index: number;
  title: string;
  fields: Array<{ label: string; value: string }>;
  footer?: string;
}): KnownBlock[] {
  const fieldPairs = options.fields
    .filter((f) => f.value)
    .map((f) => ({ type: 'mrkdwn' as const, text: `*${f.label}*\n${f.value}` }));

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Case ${options.index} — ${options.title}*` },
      ...(fieldPairs.length > 0 ? { fields: fieldPairs.slice(0, 10) } : {}),
    },
  ];

  if (options.footer) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: options.footer }],
    });
  }

  blocks.push({ type: 'divider' });
  return blocks;
}

export function assigneeGroupBlock(assignee: string, mrns: string[], extra?: string): KnownBlock {
  const list = mrns.map((m) => `\`${m}\``).join(', ');
  const text = extra
    ? `*${assignee}* (${mrns.length})\n${list}\n_${extra}_`
    : `*${assignee}* (${mrns.length})\n${list}`;
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

export function flattenBlocks(blockGroups: KnownBlock[][]): KnownBlock[] {
  return blockGroups.flat();
}

export type SlackBlock = Block | KnownBlock;
