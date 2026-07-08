import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface CptChecklist {
  cpt_code: string;
  modality: string;
  body_part: string;
  pre_submission_checklist: string[];
  common_denial_themes: string[];
  prevention_playbook: string[];
}

export interface DenialAnalysis {
  denial_theme: string;
  payer_cited_gaps: string[];
  checklist_items: string[];
  prevention_summary: string;
  matched_cpt: string;
}

const PLAYBOOK_ROOT = resolve(
  process.cwd(),
  '../MegaAnalytics/knowledge/07-denial-playbooks/cpt-checklists'
);

interface GapRule {
  patterns: RegExp[];
  payerGap: string;
  actions: string[];
}

/** Denial-letter phrases → what was missing + pre-submit actions */
const GAP_RULES: GapRule[] = [
  {
    patterns: [
      /does not show one of these findings/i,
      /most symptomatic joint/i,
      /dominant hand or wrist/i,
    ],
    payerGap: 'Chart did not identify the most symptomatic joint or dominant hand/wrist',
    actions: [
      'Document the most symptomatic joint OR dominant hand/wrist in the clinical note',
    ],
  },
  {
    patterns: [
      /did not describe one of these reasons/i,
      /recently had an mri/i,
      /reasons for further imaging/i,
    ],
    payerGap: 'Chart did not justify repeat imaging after a prior approved MRI',
    actions: [
      'Document one of: progression since prior MRI, prior MRI incomplete/unclear, or prior MRI not performed/will not be performed',
    ],
  },
  {
    patterns: [/failed conservative/i, /conservative (therapy|treatment)/i],
    payerGap: 'Failed conservative therapy not documented',
    actions: ['Document failed conservative therapy when payer policy requires it'],
  },
  {
    patterns: [/not medically necessary/i, /medical necessity/i],
    payerGap: 'Medical necessity criteria not met',
    actions: ['Align clinical note language to payer policy bullets before resubmit'],
  },
  {
    patterns: [/clinical information.{0,80}(does not|did not)/i],
    payerGap: 'Clinical documentation sent was insufficient',
    actions: ['Issue a query for missing history/exam findings before submission'],
  },
  {
    patterns: [/prior auth/i, /authorization.{0,40}(not|denied|missing)/i],
    payerGap: 'Prior authorization issue cited',
    actions: ['Verify prior auth status and attach approval reference before submit'],
  },
  {
    patterns: [/diagnosis.{0,60}(does not|did not)/i, /icd.{0,40}(does not|did not)/i],
    payerGap: 'Diagnosis does not support the ordered procedure',
    actions: ['Confirm ordering diagnosis codes support medical necessity for the CPT'],
  },
];

const FAILURE_SENTENCE_PATTERNS = [
  /clinical information[^.]{0,200}(does not|did not)[^.]*\./gi,
  /the clinical information provided[^.]*\./gi,
  /we cannot approve[^.]*\./gi,
];

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

const EMPTY_CHECKLIST: CptChecklist = {
  cpt_code: 'default',
  modality: '',
  body_part: '',
  pre_submission_checklist: [],
  common_denial_themes: [],
  prevention_playbook: [],
};

function loadChecklist(fileName: string): CptChecklist {
  const filePath = resolve(PLAYBOOK_ROOT, fileName);
  if (!existsSync(filePath)) {
    console.warn(`[denial-analyzer] Checklist not found: ${filePath} — using empty default`);
    return EMPTY_CHECKLIST;
  }
  return loadJson<CptChecklist>(filePath);
}

function resolveChecklistFile(cptCodes: string | null | undefined, denialNote: string): string {
  const indexPath = resolve(PLAYBOOK_ROOT, 'index.json');
  if (!existsSync(indexPath)) {
    return '_default.json';
  }

  const index = loadJson<{
    [key: string]: string;
    _keyword_routes?: Array<{ keywords: string[]; checklist: string }>;
  }>(indexPath);

  const codes = (cptCodes ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  for (const code of codes) {
    if (index[code]) {
      return index[code];
    }
  }

  const noteLower = denialNote.toLowerCase();
  for (const route of index._keyword_routes ?? []) {
    if (route.keywords.some((kw) => noteLower.includes(kw))) {
      return route.checklist;
    }
  }

  return '_default.json';
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractFailureSentences(denialNote: string): string[] {
  const note = denialNote.replace(/\r\n/g, '\n');
  const found: string[] = [];

  for (const pattern of FAILURE_SENTENCE_PATTERNS) {
    const matches = note.match(pattern);
    if (matches) {
      found.push(...matches.map((m) => normalizeWhitespace(m)));
    }
  }

  return [...new Set(found)].slice(0, 4);
}

/** What the payer letter says was wrong — not policy requirement bullets */
export function extractPayerCitedGaps(denialNote: string): string[] {
  const gaps: string[] = [];

  for (const rule of GAP_RULES) {
    if (rule.patterns.some((p) => p.test(denialNote))) {
      gaps.push(rule.payerGap);
    }
  }

  if (gaps.length < 3) {
    for (const sentence of extractFailureSentences(denialNote)) {
      const short = sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
      const isRedundant = gaps.some(
        (g) =>
          short.toLowerCase().includes(g.toLowerCase().slice(0, 20)) ||
          g.toLowerCase().includes(short.toLowerCase().slice(0, 20))
      );
      if (!isRedundant) {
        gaps.push(short);
      }
    }
  }

  return [...new Set(gaps)].slice(0, 5);
}

function detectDenialTheme(
  denialNote: string,
  payerGaps: string[],
  checklist: CptChecklist
): string {
  const note = denialNote.toLowerCase();

  for (const theme of checklist.common_denial_themes) {
    const themeNorm = theme.toLowerCase();
    if (note.includes(themeNorm) || payerGaps.some((g) => g.toLowerCase().includes(themeNorm))) {
      return theme.replace(/\s+/g, '_');
    }
  }

  if (payerGaps.some((g) => /symptomatic joint|dominant hand/i.test(g))) {
    return 'symptomatic_joint_not_documented';
  }
  if (payerGaps.some((g) => /prior mri|repeat imaging/i.test(g))) {
    return 'prior_imaging_not_addressed';
  }
  if (note.includes('medical necessity') || note.includes('cannot approve')) {
    return 'medical_necessity_not_met';
  }
  if (note.includes('clinical information') || note.includes('documentation')) {
    return 'insufficient_clinical_documentation';
  }
  return 'general_denial';
}

function actionsFromGapRules(denialNote: string): string[] {
  const actions: string[] = [];
  for (const rule of GAP_RULES) {
    if (rule.patterns.some((p) => p.test(denialNote))) {
      actions.push(...rule.actions);
    }
  }
  return actions;
}

function relevantCptChecklistItems(denialNote: string, checklist: CptChecklist): string[] {
  const noteLower = denialNote.toLowerCase();
  return checklist.pre_submission_checklist
    .map((item) => {
      const tokens = item
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4);
      const hits = tokens.filter((t) => noteLower.includes(t)).length;
      return { item, hits };
    })
    .filter(({ hits }) => hits >= 2)
    .sort((a, b) => b.hits - a.hits)
    .map(({ item }) => item);
}

function relevantPlaybookTips(denialNote: string, checklist: CptChecklist): string[] {
  const noteLower = denialNote.toLowerCase();
  return checklist.prevention_playbook.filter((tip) => {
    const tokens = tip
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    return tokens.filter((t) => noteLower.includes(t)).length >= 2;
  });
}

function dedupeSimilarItems(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
    if (result.some((r) => r.toLowerCase().includes(key.slice(0, 24)) || key.includes(r.toLowerCase().slice(0, 24)))) {
      continue;
    }
    result.push(item);
  }
  return result;
}
function buildChecklistItems(input: {
  denialNote: string;
  checklist: CptChecklist;
  queryBeforeDenial?: boolean;
}): string[] {
  const fromGaps = actionsFromGapRules(input.denialNote);
  const fromCpt = relevantCptChecklistItems(input.denialNote, input.checklist);
  const fromPlaybook = relevantPlaybookTips(input.denialNote, input.checklist);

  let items = dedupeSimilarItems(
    [...fromGaps, ...fromCpt, ...fromPlaybook].map((s) => s.trim()).filter(Boolean)
  );

  if (items.length === 0) {
    items = input.checklist.pre_submission_checklist.slice(0, 4);
  }

  if (input.queryBeforeDenial === false) {
    items.unshift('Raise a query before submit — no query was documented prior to this denial');
  }

  return dedupeSimilarItems(items).slice(0, 6);
}

export function formatDenialChecklistForSlack(analysis: DenialAnalysis): string {
  if (analysis.payer_cited_gaps.length === 0) {
    return '_No payer gaps extracted — review full denial letter._';
  }
  return `*What the payer said was missing:*\n${analysis.payer_cited_gaps.map((g) => `• ${g}`).join('\n')}`;
}

export function analyzeDenial(input: {
  denialNote: string;
  cptCodes?: string | null;
  queryBeforeDenial?: boolean;
}): DenialAnalysis {
  const checklistFile = resolveChecklistFile(input.cptCodes, input.denialNote);
  const checklist = loadChecklist(checklistFile);
  const payer_cited_gaps = extractPayerCitedGaps(input.denialNote);
  const denial_theme = detectDenialTheme(input.denialNote, payer_cited_gaps, checklist);
  const checklist_items = buildChecklistItems({
    denialNote: input.denialNote,
    checklist,
    queryBeforeDenial: input.queryBeforeDenial,
  });

  const prevention_summary = checklist_items[0] ?? 'Review denial letter and CPT checklist before resubmit.';

  return {
    denial_theme,
    payer_cited_gaps,
    checklist_items,
    prevention_summary: prevention_summary.slice(0, 280),
    matched_cpt: checklist.cpt_code,
  };
}

export function getOrderDeepLink(orderId: string): string | null {
  const template = process.env.ONE_RISA_ORDER_URL_TEMPLATE;
  if (!template?.includes('{order_id}')) {
    return null;
  }
  return template.replace('{order_id}', orderId);
}
