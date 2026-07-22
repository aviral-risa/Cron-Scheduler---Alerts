import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const getEnv = (key: string) => {
  return process.env[key];
};

type CredentialSource =
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'BIGQUERY_KEY_FILE'
  | 'MEGA_ANALYTICS_KEY_FILE'
  | 'VITE_ENV'
  | 'ADC';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

let bigqueryClient: BigQuery | null = null;
let credentialSource: CredentialSource | null = null;
let credentialClientEmail: string | undefined;

function parseKeyFile(keyPath: string): ServiceAccountCredentials | undefined {
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

function loadGoogleApplicationCredentials(): ServiceAccountCredentials | undefined {
  const credPath = getEnv('GOOGLE_APPLICATION_CREDENTIALS');
  if (!credPath) {
    return undefined;
  }

  return parseKeyFile(credPath);
}

function loadKeyFileCredentials():
  | { credentials: ServiceAccountCredentials; source: CredentialSource }
  | undefined {
  const explicitPath = getEnv('BIGQUERY_KEY_FILE');
  if (explicitPath) {
    const credentials = parseKeyFile(explicitPath);
    if (credentials) {
      return { credentials, source: 'BIGQUERY_KEY_FILE' };
    }
    return undefined;
  }

  // Do not silently fall back to MegaAnalytics key in CI
  if (getEnv('GITHUB_ACTIONS') === 'true' || getEnv('CI') === 'true') {
    return undefined;
  }

  const fallbackPath = resolve(process.cwd(), '../MegaAnalytics/firebase-prod.json');
  const credentials = parseKeyFile(fallbackPath);
  if (credentials) {
    return { credentials, source: 'MEGA_ANALYTICS_KEY_FILE' };
  }

  return undefined;
}

function loadViteCredentials(): ServiceAccountCredentials | undefined {
  const clientEmail = getEnv('VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getEnv('VITE_GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    return undefined;
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function resolveCredentials(): {
  credentials?: ServiceAccountCredentials;
  source: CredentialSource;
  clientEmail?: string;
} {
  const gacCreds = loadGoogleApplicationCredentials();
  if (gacCreds) {
    return {
      credentials: gacCreds,
      source: 'GOOGLE_APPLICATION_CREDENTIALS',
      clientEmail: gacCreds.client_email,
    };
  }

  const keyFileResult = loadKeyFileCredentials();
  if (keyFileResult) {
    return {
      credentials: keyFileResult.credentials,
      source: keyFileResult.source,
      clientEmail: keyFileResult.credentials.client_email,
    };
  }

  const viteCreds = loadViteCredentials();
  if (viteCreds) {
    return {
      credentials: viteCreds,
      source: 'VITE_ENV',
      clientEmail: viteCreds.client_email,
    };
  }

  return { source: 'ADC' };
}

function logCredentialSource(source: CredentialSource, clientEmail?: string): void {
  if (clientEmail) {
    console.log(`[BigQuery] Using credentials from ${source} (${clientEmail})`);
  } else {
    console.log(`[BigQuery] Using credentials from ${source}`);
  }
}

/**
 * Initialize BigQuery client.
 * Priority: GOOGLE_APPLICATION_CREDENTIALS → BIGQUERY_KEY_FILE → MegaAnalytics (local only) → VITE_* → ADC
 */
function getBigQueryClient(): BigQuery {
  if (!bigqueryClient) {
    const projectId = getEnv('BIGQUERY_PROJECT_ID') || 'prior--backen-prod-svc-u4g8';
    const resolved = resolveCredentials();

    credentialSource = resolved.source;
    credentialClientEmail = resolved.clientEmail;
    logCredentialSource(resolved.source, resolved.clientEmail);

    if (resolved.credentials) {
      bigqueryClient = new BigQuery({
        projectId,
        credentials: resolved.credentials,
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
  credentialSource = 'ADC';
  credentialClientEmail = undefined;
  console.log('[BigQuery] Switched to Application Default Credentials');
  return bigqueryClient;
}

export function getCredentialSource(): CredentialSource {
  if (!credentialSource) {
    getBigQueryClient();
  }
  return credentialSource ?? 'ADC';
}

export function getCredentialClientEmail(): string | undefined {
  if (!credentialSource) {
    getBigQueryClient();
  }
  return credentialClientEmail;
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
