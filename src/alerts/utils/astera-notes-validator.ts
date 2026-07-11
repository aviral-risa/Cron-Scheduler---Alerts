import {
  AUTH_BO_NOTE_RULES,
  CALL_NAME_PATTERN,
  CALL_REF_PATTERN,
  DATE_IN_NOTE_PATTERN,
  FINAL_MASTER_AUTH_STATUSES,
  PORTAL_PATTERN,
  PRIOR_AUTH_CONFLICTS_WITH_WIP,
  findRuleForAuthStatus,
  findRuleForStatus,
  normalizeAuthStatus,
  normalizeBoStatus,
  type NoteExpectation,
} from '../config/astera-note-templates.config';

export type NoteIssueCode =
  | 'auth_bo_mismatch'
  | 'template_non_compliant'
  | 'final_status_note'
  | 'wip_stale_note'
  | 'auth_existing_moved_wip'
  | 'insurance_issue_no_date'
  | 'missing_onco_paste'
  | 'unexpected_note';

export interface NoteAuditRow {
  audit_kind: 'pasted' | 'missing_paste';
  comment_id: string | null;
  order_id: string;
  mrn: string;
  assigned_to: string | null;
  provider_name: string | null;
  note_text: string | null;
  template_text: string | null;
  master_auth_status: string | null;
  bo_status: string | null;
  prev_master_auth_status: string | null;
  wip_business_days: number | null;
}

export interface NoteAuditFinding {
  row: NoteAuditRow;
  issues: Array<{ code: NoteIssueCode; message: string }>;
}

export function normalizeNoteText(text: string | null | undefined): string {
  return (text ?? '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function satisfiesPortalOrCall(note: string): boolean {
  if (PORTAL_PATTERN.test(note)) {
    return true;
  }
  if (/through\s+call\b/i.test(note)) {
    return CALL_REF_PATTERN.test(note) || CALL_NAME_PATTERN.test(note);
  }
  return false;
}

function checkTemplateCompliance(
  note: string,
  rule: { requiredPatterns: RegExp[]; noteExpectation: NoteExpectation }
): string[] {
  if (rule.noteExpectation === 'forbidden') {
    return ['Note pasted but status does not require an OncoEMR note'];
  }

  const missing: string[] = [];
  for (const pattern of rule.requiredPatterns) {
    if (pattern === PORTAL_PATTERN) {
      if (!satisfiesPortalOrCall(note)) {
        missing.push('Portal/Call wording');
      }
      continue;
    }
    if (!pattern.test(note)) {
      missing.push(pattern.source.replace(/\\b/g, '').slice(0, 48));
    }
  }
  return missing;
}

export function validateNoteAuditRow(row: NoteAuditRow): NoteAuditFinding {
  const issues: NoteAuditFinding['issues'] = [];
  const note = normalizeNoteText(row.note_text ?? row.template_text);
  const auth = normalizeAuthStatus(row.master_auth_status);
  const bo = normalizeBoStatus(row.bo_status);
  const prevAuth = normalizeAuthStatus(row.prev_master_auth_status);

  if (row.audit_kind === 'missing_paste') {
    issues.push({
      code: 'missing_onco_paste',
      message: 'RISA template generated but no OncoEMR note pasted today',
    });
    return { row, issues };
  }

  const matchedRule = findRuleForStatus(auth, bo);
  const authOnlyRule = findRuleForAuthStatus(auth);

  if (!matchedRule && authOnlyRule) {
    issues.push({
      code: 'auth_bo_mismatch',
      message: `Auth "${authOnlyRule.label}" expects BO ${authOnlyRule.expectedBo.join('/')} but got "${row.bo_status ?? '—'}"`,
    });
  } else if (!matchedRule && auth) {
    const expected = AUTH_BO_NOTE_RULES.find((r) => r.authStatuses.includes(auth));
    if (expected && !expected.expectedBo.includes(bo)) {
      issues.push({
        code: 'auth_bo_mismatch',
        message: `Auth/BO pair (${auth} / ${row.bo_status ?? '—'}) not in mapping sheet`,
      });
    }
  }

  if (matchedRule?.noteExpectation === 'forbidden') {
    issues.push({
      code: 'unexpected_note',
      message: `${matchedRule.label} — note should not be pasted to OncoEMR`,
    });
  }

  if (FINAL_MASTER_AUTH_STATUSES.has(auth) && row.audit_kind === 'pasted') {
    issues.push({
      code: 'final_status_note',
      message: `Note pasted while order already in final status (${auth})`,
    });
  }

  if (
    auth === 'work_in_progress' &&
    typeof row.wip_business_days === 'number' &&
    row.wip_business_days >= 1
  ) {
    issues.push({
      code: 'wip_stale_note',
      message: `WIP note on case with ${row.wip_business_days} business day(s) in WIP`,
    });
  }

  if (
    auth === 'work_in_progress' &&
    PRIOR_AUTH_CONFLICTS_WITH_WIP.has(prevAuth)
  ) {
    issues.push({
      code: 'auth_existing_moved_wip',
      message: `Already ${prevAuth.replace(/_/g, ' ')} — moved to WIP but WIP note pasted`,
    });
  }

  if (bo === 'authmate-issue' && /query\s*:/i.test(note) && !DATE_IN_NOTE_PATTERN.test(note)) {
    issues.push({
      code: 'insurance_issue_no_date',
      message: 'AuthMate-Issue / Query note missing a date',
    });
  }

  const complianceRule = matchedRule ?? authOnlyRule;
  if (complianceRule && complianceRule.noteExpectation === 'required' && note) {
    const missingParts = checkTemplateCompliance(note, complianceRule);
    if (missingParts.length > 0) {
      issues.push({
        code: 'template_non_compliant',
        message: `Template missing: ${missingParts.slice(0, 4).join(', ')}`,
      });
    }
  } else if (complianceRule?.noteExpectation === 'required' && !note) {
    issues.push({
      code: 'template_non_compliant',
      message: 'Empty note body',
    });
  }

  return { row, issues };
}

export function auditNoteRows(rows: NoteAuditRow[]): NoteAuditFinding[] {
  return rows
    .map(validateNoteAuditRow)
    .filter((finding) => finding.issues.length > 0);
}

export function formatIssueLine(finding: NoteAuditFinding): string {
  const issueSummary = finding.issues.map((i) => i.message).join(' · ');
  const who = finding.row.provider_name ?? finding.row.assigned_to ?? 'Unknown';
  return `• \`${finding.row.mrn}\` (${who}) — ${issueSummary}`;
}
