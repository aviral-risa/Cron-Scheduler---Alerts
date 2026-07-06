import { Router } from 'express';
import { queryBigQuery } from '../services/bigquery';
import {
  BILLING_CLIENT_CONFIGS,
  BILLING_DATASET_OVERRIDE,
  getBillingConfigByFacilityId,
  getExcludedStatuses,
  getFirstApprovalStatuses,
  getQueryStatuses,
  getDenialStatuses,
  type BillingDataset,
} from '../config/billing-sources.config';
import { ORGANIZATIONS } from '../config/organizations';
import type { BillingDataRow, BillingMetrics, BillingAnalyticsResponse } from '../types/billingAnalytics';

const router = Router();

const BQ_PROJECT = process.env.BIGQUERY_PROJECT_ID || 'prior--backen-prod-svc-u4g8';

// ---------------------------------------------------------------------------
// GET /api/billing-analytics/clients
// ---------------------------------------------------------------------------

router.get('/clients', (_req, res) => {
  const clients = BILLING_CLIENT_CONFIGS
    .filter((c) => c.enabled)
    .map((c) => {
      const org = ORGANIZATIONS.find((o) => o.id === c.orgId);
      return {
        orgId: c.orgId,
        orgName: org?.name ?? c.orgId,
        facilityId: c.table,
        dataset: BILLING_DATASET_OVERRIDE ?? c.dataset,
        availableDatasets: c.availableDatasets,
      };
    });
  res.json(clients);
});

// ---------------------------------------------------------------------------
// GET /api/billing-analytics/data
// ---------------------------------------------------------------------------

router.get('/data', async (req, res) => {
  try {
    const { facilityId, startDate, endDate, dataset: datasetOverride } = req.query;

    if (!facilityId || !startDate || !endDate) {
      return res.status(400).json({ error: 'facilityId, startDate, and endDate are required' });
    }

    const config = getBillingConfigByFacilityId(facilityId as string);
    if (!config) {
      return res.status(404).json({ error: `No billing config found for facilityId: ${facilityId}` });
    }

    // Resolve dataset: query param > global override > per-client default
    let effectiveDataset: BillingDataset = config.dataset;
    if (datasetOverride && config.availableDatasets.includes(datasetOverride as BillingDataset)) {
      effectiveDataset = datasetOverride as BillingDataset;
    } else if (BILLING_DATASET_OVERRIDE) {
      effectiveDataset = BILLING_DATASET_OVERRIDE;
    }

    // Query BigQuery
    const sql = `
      SELECT *
      FROM \`${BQ_PROJECT}.${effectiveDataset}.${config.table}\`
      WHERE CAST(date_of_work AS DATE) >= @startDate
        AND CAST(date_of_work AS DATE) <= @endDate
      ORDER BY date_of_work DESC
      LIMIT 50000
    `;

    console.log(`[Billing] Querying ${effectiveDataset}.${config.table} for ${startDate} to ${endDate}`);
    const rawRows = await queryBigQuery<Record<string, unknown>>(sql, {
      startDate: startDate as string,
      endDate: endDate as string,
    });

    console.log(`[Billing] Raw rows returned: ${rawRows.length}`);

    // Normalize rows
    const normalizedRows = rawRows.map(normalizeRow);

    // Step 1: Deduplicate by UID (MRN x Regimen x DateOfService) — keep first DoS
    const deduped = deduplicateByUID(normalizedRows);
    console.log(`[Billing] After dedup: ${deduped.length} (removed ${normalizedRows.length - deduped.length} duplicates)`);

    // Step 2: Filter out non-billable statuses
    const excluded = new Set(getExcludedStatuses(effectiveDataset));
    const billable = deduped.filter((row) => {
      const status = row.auth_status ?? '';
      return !excluded.has(status);
    });
    console.log(`[Billing] After exclusion: ${billable.length} billable rows`);

    // Step 3: Calculate metrics
    const metrics = calculateMetrics(billable, effectiveDataset);

    const response: BillingAnalyticsResponse = {
      rows: billable,
      metrics,
      totalRawCount: rawRows.length,
      dataset: effectiveDataset,
      table: config.table,
      query: {
        startDate: startDate as string,
        endDate: endDate as string,
        facilityId: facilityId as string,
      },
    };

    res.json(response);
  } catch (err: unknown) {
    console.error('[Billing] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeRow(raw: Record<string, unknown>): BillingDataRow {
  return {
    date_of_work: extractDatetime(raw.date_of_work),
    mrn: asString(raw.mrn),
    patient_name: asString(raw.patient_name),
    dob: extractDatetime(raw.dob),
    md: asString(raw.md),
    primary_insurance: asString(raw.primary_insurance),
    id: asString(raw.id),
    regimen: asString(raw.regimen),
    auth_status: asString(raw.auth_status),
    bo_value: asString(raw.bo_value),
    date_of_service: extractDatetime(raw.date_of_service),
    location: asString(raw.location),
    denial_comments: asString(raw.denial_comments),
    auth_issue_comments: asString(raw.auth_issue_comments),
    status_tracking_rpa: asString(raw.status_tracking_rpa),
    cpt_code: asString(raw.cpt_code),
    icd_10: asString(raw.icd_10),
    org_id: asString(raw.org_id),
    bo_count: raw.bo_count != null ? Number(raw.bo_count) : null,
    order_creation_date: extractDatetime(raw.order_creation_date),
    provider_npi: asString(raw.provider_npi),
  };
}

function asString(val: unknown): string | null {
  if (val == null) return null;
  return String(val);
}

function extractDatetime(val: unknown): string | null {
  if (val == null) return null;
  // BigQuery DATETIME comes as { value: "2025-07-14T00:00:00" }
  if (typeof val === 'object' && val !== null && 'value' in val) {
    return String((val as { value: unknown }).value);
  }
  return String(val);
}

/**
 * Deduplicate by UID = MRN x Regimen x DateOfService.
 * For each UID, keep the row with the earliest date_of_service.
 */
function deduplicateByUID(rows: BillingDataRow[]): BillingDataRow[] {
  const uidMap = new Map<string, BillingDataRow>();

  for (const row of rows) {
    const uid = `${row.mrn ?? ''}|${row.regimen ?? ''}|${row.date_of_service ?? ''}`;
    const existing = uidMap.get(uid);
    if (!existing) {
      uidMap.set(uid, row);
    } else {
      // Keep the one with the earlier date_of_service
      const existingDos = existing.date_of_service ?? '';
      const currentDos = row.date_of_service ?? '';
      if (currentDos < existingDos) {
        uidMap.set(uid, row);
      }
    }
  }

  return Array.from(uidMap.values());
}

function calculateMetrics(billableRows: BillingDataRow[], dataset: BillingDataset): BillingMetrics {
  const total = billableRows.length;
  if (total === 0) {
    return {
      totalBillable: 0,
      firstApprovalCount: 0,
      firstApprovalRate: 0,
      queryRaisedCount: 0,
      queryRaisedPct: 0,
      denialCount: 0,
      denialPct: 0,
    };
  }

  const approvalStatuses = new Set(getFirstApprovalStatuses(dataset));
  const queryStatuses = new Set(getQueryStatuses(dataset));
  const denialStatuses = new Set(getDenialStatuses(dataset));

  let firstApprovalCount = 0;
  let queryRaisedCount = 0;
  let denialCount = 0;

  for (const row of billableRows) {
    const status = row.auth_status ?? '';
    if (approvalStatuses.has(status)) firstApprovalCount++;
    if (queryStatuses.has(status)) queryRaisedCount++;
    if (denialStatuses.has(status)) denialCount++;
  }

  return {
    totalBillable: total,
    firstApprovalCount,
    firstApprovalRate: Math.round((firstApprovalCount / total) * 10000) / 100,
    queryRaisedCount,
    queryRaisedPct: Math.round((queryRaisedCount / total) * 10000) / 100,
    denialCount,
    denialPct: Math.round((denialCount / total) * 10000) / 100,
  };
}

export { router as billingAnalyticsRouter };
