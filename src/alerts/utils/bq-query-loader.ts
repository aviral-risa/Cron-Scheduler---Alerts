import { readFileSync } from 'fs';
import { resolve } from 'path';
import { queryBigQuery } from '../../services/bigquery';

const SQL_ROOT = resolve(
  process.cwd(),
  '../MegaAnalytics/knowledge/03-sql-patterns'
);

export function loadSqlFile(fileName: string): string {
  const path = resolve(SQL_ROOT, fileName);
  return readFileSync(path, 'utf8');
}

export async function runBqAlertQuery<T extends Record<string, unknown>>(
  fileName: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const sql = loadSqlFile(fileName);
  return queryBigQuery<T>(sql, params);
}
