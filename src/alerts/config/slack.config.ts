import 'dotenv/config';
import { ORGANIZATIONS, type Organization } from '../../config/organizations';

/**
 * Centralized Slack Configuration
 *
 * Single source of truth for all Slack-related configuration including:
 * - Webhook URLs (organization-specific)
 * - Bot tokens and channel IDs
 * - Organization mappings
 */
export class SlackConfig {
  /**
   * Get webhook URL for a specific organization
   * @param orgId Organization ID (e.g., 'nycbs', 'chc')
   * @returns Webhook URL from environment variables
   * @throws Error if webhook URL is not configured
   */
  static getWebhookUrl(orgId: string): string {
    const envKey = `SLACK_WEBHOOK_${orgId.toUpperCase()}`;
    const webhookUrl = process.env[envKey];

    if (!webhookUrl) {
      throw new Error(
        `Slack webhook URL not configured for organization '${orgId}'. ` +
        `Please set environment variable: ${envKey}`
      );
    }

    return webhookUrl;
  }

  /**
   * Get webhook URL for a specific organization (safe version that returns undefined)
   * @param orgId Organization ID
   * @returns Webhook URL or undefined if not configured
   */
  static getWebhookUrlSafe(orgId: string): string | undefined {
    const envKey = `SLACK_WEBHOOK_${orgId.toUpperCase()}`;
    return process.env[envKey];
  }

  /**
   * Get Slack bot token for file uploads and API operations
   * @returns Bot token from environment variables
   * @throws Error if bot token is not configured
   */
  static getBotToken(): string {
    const botToken = process.env.SLACK_BOT_TOKEN;

    if (!botToken) {
      throw new Error(
        'Slack bot token not configured. Please set environment variable: SLACK_BOT_TOKEN'
      );
    }

    return botToken;
  }

  /**
   * Get default Slack channel ID for bot operations
   * @returns Channel ID from environment variables
   * @throws Error if channel ID is not configured
   */
  static getDefaultChannelId(): string {
    const channelId = process.env.SLACK_CHANNEL;

    if (!channelId) {
      throw new Error(
        'Default Slack channel not configured. Please set environment variable: SLACK_CHANNEL'
      );
    }

    return channelId;
  }

  /** test_alerts channel for cron skip / catch-up notifications */
  static getTestAlertsChannelId(): string {
    return process.env.SLACK_CHANNEL_TEST_ALERTS ?? 'C0A7LHVNF5M';
  }

  /**
   * Get organization configuration by ID
   * @param orgId Organization ID (e.g., 'nycbs', 'chc')
   * @returns Organization configuration
   * @throws Error if organization not found
   */
  static getOrgConfig(orgId: string): Organization {
    const org = ORGANIZATIONS.find((o) => o.id === orgId.toLowerCase());

    if (!org) {
      throw new Error(
        `Organization '${orgId}' not found. Available: ${ORGANIZATIONS.map((o) => o.id).join(', ')}`
      );
    }

    return org;
  }

  /**
   * Get Slack channel ID for a specific organization
   * @param orgId Organization ID
   * @returns Slack channel ID from organization config
   */
  static getChannelId(orgId: string): string {
    const org = this.getOrgConfig(orgId);
    return org.slackChannelId;
  }

  /**
   * Get all configured organizations
   * @returns Array of all organization configurations
   */
  static getAllOrganizations(): Organization[] {
    return ORGANIZATIONS;
  }

  /**
   * Check if webhook URL is configured for an organization
   * @param orgId Organization ID
   * @returns True if webhook is configured
   */
  static hasWebhookUrl(orgId: string): boolean {
    const envKey = `SLACK_WEBHOOK_${orgId.toUpperCase()}`;
    return !!process.env[envKey];
  }

  /**
   * Get alerts webhook URL (for performance alerts, not org-specific)
   * @returns Alerts webhook URL or undefined
   */
  static getAlertsWebhookUrl(): string | undefined {
    return process.env.SLACK_WEBHOOK_ALERTS;
  }
}
