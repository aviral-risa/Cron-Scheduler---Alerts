/**
 * Astera Radiology — Auth Status → BO Value → OncoEMR note template rules.
 * Source: Astera Radiology Working Sheet (Exhaustive Auth Status and BO Mapping).
 */

export type NoteExpectation = 'required' | 'forbidden' | 'optional';

export interface AuthBoNoteRule {
  /** master_auth_status values (lowercase snake_case) */
  authStatuses: string[];
  /** Expected bo_status values (normalized lowercase, no spaces) */
  expectedBo: string[];
  /** Regex patterns the pasted note must satisfy */
  requiredPatterns: RegExp[];
  /** Whether a note should exist for this status pair */
  noteExpectation: NoteExpectation;
  /** Human label for Slack */
  label: string;
}

/** Final auth outcomes — flag if a daily note is pasted while already in this state */
export const FINAL_MASTER_AUTH_STATUSES = new Set([
  'auth_by_risa',
  'auth_on_file',
  'no_auth_required',
  'denied_by_risa',
  'existing_denial',
  'denied_after_query',
  'denial_after_query',
]);

/** Prior auth states that conflict with a new WIP note */
export const PRIOR_AUTH_CONFLICTS_WITH_WIP = new Set(['auth_by_risa', 'auth_on_file']);

export function normalizeBoStatus(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('authmate-pending', 'authmate-pending')
    .replace('notappilcable', 'notapplicable')
    .replace('notapplicable', 'notapplicable');
}

export function normalizeAuthStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** Flexible portal wording — Evicore Portal, Portal, etc. */
export const PORTAL_PATTERN = /through\s+(?:\w[\w\s]*\s+)?portal\b/i;

/** Call path — name and/or reference */
export const CALL_PATTERN = /through\s+call\b/i;
export const CALL_REF_PATTERN = /(?:ref#|reference\s*#?)\s*[\w-]+/i;
export const CALL_NAME_PATTERN = /\b(?:spoke\s+with|contacted|called)\s+[A-Z][\w\s.'-]{2,}/i;

export const DATE_IN_NOTE_PATTERN =
  /\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i;

const AUTHMATE_HEADER = /authmate\s+case/i;
const INSURANCE_LINE = /insurance\s+company\/id#/i;

export const AUTH_BO_NOTE_RULES: AuthBoNoteRule[] = [
  {
    authStatuses: ['work_in_progress'],
    expectedBo: ['authmate'],
    requiredPatterns: [AUTHMATE_HEADER, INSURANCE_LINE, /auth\s+is\s+required/i, /wip/i, PORTAL_PATTERN],
    noteExpectation: 'required',
    label: 'Work In Progress',
  },
  {
    authStatuses: ['query'],
    expectedBo: ['authmate-issue'],
    requiredPatterns: [AUTHMATE_HEADER, INSURANCE_LINE, /query\s*:/i],
    noteExpectation: 'required',
    label: 'Query',
  },
  {
    authStatuses: ['pending', 'auth_pending'],
    expectedBo: ['authmate-pending'],
    requiredPatterns: [
      AUTHMATE_HEADER,
      INSURANCE_LINE,
      /ref#/i,
      /pending/i,
      PORTAL_PATTERN,
    ],
    noteExpectation: 'required',
    label: 'Pending',
  },
  {
    authStatuses: ['no_auth_required'],
    expectedBo: ['authorized'],
    requiredPatterns: [
      AUTHMATE_HEADER,
      INSURANCE_LINE,
      /no\s+auth\s+is\s+required/i,
      /(?:portal|call)/i,
      /dx\s+code/i,
    ],
    noteExpectation: 'required',
    label: 'No Auth Required',
  },
  {
    authStatuses: ['auth_by_risa', 'auth_on_file'],
    expectedBo: ['authorized'],
    requiredPatterns: [
      AUTHMATE_HEADER,
      INSURANCE_LINE,
      /auth#/i,
      /approved/i,
      /from\s+.+\s+to\s+/i,
      /(?:portal|call)/i,
    ],
    noteExpectation: 'required',
    label: 'Authorized',
  },
  {
    authStatuses: ['existing_denial'],
    expectedBo: ['authmate-denied'],
    requiredPatterns: [
      AUTHMATE_HEADER,
      /existing\s+denial/i,
      /ref#/i,
      /dos\s*:/i,
      /denial\s+reason\s*:/i,
      /(?:portal|call)/i,
    ],
    noteExpectation: 'required',
    label: 'Existing Denial',
  },
  {
    authStatuses: ['denied_by_risa'],
    expectedBo: ['authmate-denied'],
    requiredPatterns: [
      AUTHMATE_HEADER,
      /auth\s+is\s+denied/i,
      /ref#/i,
      /dos\s*:/i,
      /denial\s+reason\s*:/i,
    ],
    noteExpectation: 'required',
    label: 'Denied by RISA',
  },
  {
    authStatuses: ['denied_after_query', 'denial_after_query'],
    expectedBo: ['authmate-denied'],
    requiredPatterns: [
      AUTHMATE_HEADER,
      /denied\s+after\s+query/i,
      /ref#/i,
      /dos\s*:/i,
      /denial\s+reason\s*:/i,
    ],
    noteExpectation: 'required',
    label: 'Denied after Query',
  },
  {
    authStatuses: ['insurance_changed', 'dos_changed', 'radiology_type_changed'],
    expectedBo: ['authmate-issue'],
    requiredPatterns: [AUTHMATE_HEADER, INSURANCE_LINE, /query\s*:/i],
    noteExpectation: 'required',
    label: 'AuthMate Issue (change)',
  },
  {
    authStatuses: ['not_to_work', 'duplicate_request', 'not_to_work_duplicate_request'],
    expectedBo: ['authmate-issue'],
    requiredPatterns: [AUTHMATE_HEADER, INSURANCE_LINE, /duplicate\s+request/i],
    noteExpectation: 'required',
    label: 'Duplicate Request',
  },
  {
    authStatuses: ['self_pay', 'selfpay'],
    expectedBo: ['authmate-issue'],
    requiredPatterns: [AUTHMATE_HEADER, /self\s*pay/i, /onshore\s+team/i],
    noteExpectation: 'required',
    label: 'SelfPay',
  },
  {
    authStatuses: ['worked_by_onshore_team', 'onsite_worked_after_query'],
    expectedBo: ['notapplicable'],
    requiredPatterns: [],
    noteExpectation: 'forbidden',
    label: 'Onshore — no note expected',
  },
];

export function findRuleForStatus(
  masterAuthStatus: string,
  boStatus: string
): AuthBoNoteRule | undefined {
  const auth = normalizeAuthStatus(masterAuthStatus);
  const bo = normalizeBoStatus(boStatus);
  return AUTH_BO_NOTE_RULES.find(
    (rule) => rule.authStatuses.includes(auth) && rule.expectedBo.includes(bo)
  );
}

export function findRuleForAuthStatus(masterAuthStatus: string): AuthBoNoteRule | undefined {
  const auth = normalizeAuthStatus(masterAuthStatus);
  return AUTH_BO_NOTE_RULES.find((rule) => rule.authStatuses.includes(auth));
}
