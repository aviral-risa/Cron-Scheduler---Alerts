/**
 * Logger utility for structured console output
 * Provides consistent formatting for test script logs
 */

export type LogLevel = 'info' | 'success' | 'error' | 'warn';

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Log an informational message
   */
  info(message: string): void {
    console.log(`[${this.context}] ${message}`);
  }

  /**
   * Log a success message with checkmark
   */
  success(message: string): void {
    console.log(`[${this.context}] ✓ ${message}`);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: any): void {
    console.error(`[${this.context}] ✗ ${message}`);
    if (error) {
      if (error.stack) {
        console.error(error.stack);
      } else {
        console.error(error);
      }
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string): void {
    console.warn(`[${this.context}] ⚠ ${message}`);
  }

  /**
   * Log a message without prefix
   */
  raw(message: string): void {
    console.log(message);
  }

  /**
   * Log a blank line
   */
  blank(): void {
    console.log('');
  }

  /**
   * Log a section header
   */
  header(message: string): void {
    console.log('');
    console.log(`=== ${message} ===`);
  }
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
