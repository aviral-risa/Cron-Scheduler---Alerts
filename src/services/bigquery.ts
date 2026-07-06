import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const getEnv = (key: string) => {
  return process.env[key];
};

let bigqueryClient: BigQuery | null = null;

function loadKeyFileCredentials():
  | { client_email: string; private_key: string }
  | undefined {
  const keyPath =
    getEnv('BIGQUERY_KEY_FILE') ||
    resolve(process.cwd(), '../MegaAnalytics/firebase-prod.json');

  if (!existsSync(keyPath)) {
    return undefined;
  }

  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as {
    client_email?: string;
    private_key?: string;
  };

  if (!key.client_email || !key.private_key) {
    return undefined;
  }

  return {
    client_email: key.client_email,
    private_key: key.private_key,
  };
}

/**
 * Initialize BigQuery client.
 * Priority: BIGQUERY_KEY_FILE / MegaAnalytics key → env service account → ADC
 */
function getBigQueryClient(): BigQuery {
  if (!bigqueryClient) {
    const projectId = getEnv('BIGQUERY_PROJECT_ID') || 'prior--backen-prod-svc-u4g8';
    const keyFileCreds = loadKeyFileCredentials();
    const clientEmail = getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (keyFileCreds) {
      bigqueryClient = new BigQuery({
        projectId,
        credentials: keyFileCreds,
      });
    } else if (clientEmail && privateKey) {
      bigqueryClient = new BigQuery({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      });
    } else {
      bigqueryClient = new BigQuery({ projectId });
    }
  }

  return bigqueryClient;
}

/**
 * Reset client to use ADC (called on permission failure with service account)
 */
function resetToADC(): BigQuery {
  const projectId = getEnv('BIGQUERY_PROJECT_ID') || 'prior--backen-prod-svc-u4g8';
  bigqueryClient = new BigQuery({ projectId });
  console.log('[BigQuery] Switched to Application Default Credentials');
  return bigqueryClient;
}

function normalizeQueryParams(
  client: BigQuery,
  params?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!params) {
    return undefined;
  }

  const normalized = { ...params };
  for (const key of ['report_date', 'startDate', 'endDate'] as const) {
    const value = normalized[key];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      normalized[key] = client.date(value);
    }
  }

  return normalized;
}

/**
 * Run a parameterized BigQuery SQL query and return typed rows.
 */
export async function queryBigQuery<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  let client = getBigQueryClient();
  const queryParams = normalizeQueryParams(client, params);
  const queryOptions = {
    query: sql,
    params: queryParams,
    location: process.env.BIGQUERY_LOCATION || 'us-central1',
  };

  try {
    const [rows] = await client.query(queryOptions);
    return rows as T[];
  } catch (err: unknown) {
    // If permission denied with service account, retry with ADC
    if (err instanceof Error && err.message.includes('bigquery.jobs.create')) {
      console.log('[BigQuery] Service account lacks query permission, falling back to ADC...');
      client = resetToADC();
      const [rows] = await client.query({
        ...queryOptions,
        params: normalizeQueryParams(client, params),
      });
      return rows as T[];
    }
    throw err;
  }
}

/**
 * Fetch daily metrics from BigQuery for a given date range.
 */
export async function fetchDailyMetrics<T = Record<string, unknown>>(
  dataset: string,
  table: string,
  startDate: string,
  endDate: string
): Promise<T[]> {
  const sql = `
    SELECT *
    FROM \`${getBigQueryClient().projectId}.${dataset}.${table}\`
    WHERE date >= @startDate AND date <= @endDate
    ORDER BY date ASC
  `;

  return queryBigQuery<T>(sql, { startDate, endDate });
}

/**
 * List available datasets.
 */
export async function listDatasets(): Promise<string[]> {
  const client = getBigQueryClient();
  const [datasets] = await client.getDatasets();
  return datasets.map((ds) => ds.id!);
}

/**
 * List tables in a dataset.
 */
export async function listTables(datasetId: string): Promise<string[]> {
  const client = getBigQueryClient();
  const dataset = client.dataset(datasetId);
  const [tables] = await dataset.getTables();
  return tables.map((t) => t.id!);
}

export { getBigQueryClient };
