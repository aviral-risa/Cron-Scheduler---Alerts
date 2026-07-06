import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { queryBigQuery } from '../../services/bigquery';

const LOCAL_SQL_ROOT = resolve(process.cwd(), 'sql/bigquery');
const LEGACY_SQL_ROOT = resolve(process.cwd(), '../MegaAnalytics/knowledge/03-sql-patterns');

function resolveSqlRoot(): string {
  if (existsSync(LOCAL_SQL_ROOT)) {
    return LOCAL_SQL_ROOT;
  }
  return LEGACY_SQL_ROOT;
}

export function loadSqlFile(fileName: string): string {
  const path = resolve(resolveSqlRoot(), fileName);
  return readFileSync(path, 'utf8');
}

export async function runBqAlertQuery<T extends Record<string, unknown>>(
  fileName: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const sql = loadSqlFile(fileName);
  return queryBigQuery<T>(sql, params);
}
