function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TableReportOptions {
  title: string;
  subtitle: string;
  columns: Array<{ key: string; label: string; width?: string }>;
  rows: Array<Record<string, unknown>>;
  emptyMessage?: string;
}

export function generateTableReportHTML(options: TableReportOptions): string {
  const { title, subtitle, columns, rows, emptyMessage = 'No rows for this report date.' } = options;

  const header = columns
    .map(
      (col) =>
        `<th style="padding:8px 10px;text-align:left;background:#1e3a5f;color:#fff;font-size:12px;${
          col.width ? `width:${col.width};` : ''
        }">${escapeHtml(col.label)}</th>`
    )
    .join('');

  const body =
    rows.length === 0
      ? `<tr><td colspan="${columns.length}" style="padding:16px;text-align:center;color:#666;">${escapeHtml(
          emptyMessage
        )}</td></tr>`
      : rows
          .map((row, index) => {
            const cells = columns
              .map((col) => {
                const raw = row[col.key];
                const display =
                  typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : raw ?? '';
                return `<td style="padding:8px 10px;font-size:12px;vertical-align:top;border-bottom:1px solid #e5e7eb;word-break:break-word;">${escapeHtml(
                  display
                )}</td>`;
              })
              .join('');
            const bg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
            return `<tr style="background:${bg};">${cells}</tr>`;
          })
          .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; }
    .container { max-width: 1100px; margin: 0; background: #fff; }
    .header { background: #0f2744; color: #fff; padding: 16px 20px; }
    .header h1 { margin: 0 0 4px; font-size: 18px; }
    .header p { margin: 0; font-size: 12px; opacity: 0.85; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</body>
</html>`;
}
