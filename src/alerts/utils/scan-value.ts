/** Reference scan rates (Astera) — from ops pricing table */
const SCAN_RATES: Array<{ match: RegExp; value: number }> = [
  { match: /pet/i, value: 5500 },
  { match: /mri/i, value: 3000 },
  { match: /\bct\b|computed tomography/i, value: 1000 },
  { match: /\bnm\b|nuclear/i, value: 2000 },
  { match: /mammo/i, value: 300 },
  { match: /\bus\b|ultrasound/i, value: 300 },
  { match: /x-?ray/i, value: 300 },
];

export function scanValueFromRegimen(regimenName: string | null | undefined): number {
  const name = (regimenName ?? '').trim();
  if (!name) {
    return 0;
  }
  for (const { match, value } of SCAN_RATES) {
    if (match.test(name)) {
      return value;
    }
  }
  return 0;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}
