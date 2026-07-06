import crypto from 'crypto';

/**
 * Generates an MD5 hash from any data structure
 * Used for efficient change detection in unique order status tracking
 */
export function generateHash(data: any): string {
  const jsonString = JSON.stringify(data);
  return crypto.createHash('md5').update(jsonString).digest('hex');
}
