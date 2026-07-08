/** Last job outcome line for cron dispatch summary (test_alerts). */
let lastJobOutcome: string | undefined;

export function recordJobOutcome(message: string): void {
  lastJobOutcome = message;
}

export function takeJobOutcome(): string | undefined {
  const message = lastJobOutcome;
  lastJobOutcome = undefined;
  return message;
}
