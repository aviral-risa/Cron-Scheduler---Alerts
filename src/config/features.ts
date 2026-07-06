/**
 * Feature flags configuration
 * Control which features are enabled/disabled
 */

export const FEATURE_FLAGS = {
  /**
   * Enable/disable the People View tab
   * Shows individual person performance metrics
   */
  ENABLE_PEOPLE_VIEW: false,

  /**
   * Enable/disable the Queue View tab
   * Shows queue management interface
   */
  /**
   * Enable/disable the Daily Performance tab
   * Shows daily order performance metrics
   */
  ENABLE_DAILY_VIEW: false,

  ENABLE_QUEUE_VIEW: true,

  /**
   * Enable/disable EV Metrics tab
   * Shows EV (Electronic Visit) metrics
   */
  ENABLE_EV_METRICS: true,

  /**
   * Enable/disable RPA Metrics tab
   * Shows RPA (Robotic Process Automation) metrics
   */
  ENABLE_RPA_METRICS: false,

  /**
   * Enable/disable Agent Mode Metrics tab
   * Shows Agent Mode order completion metrics (Human vs Agent vs In Progress)
   */
  ENABLE_AGENT_MODE_METRICS: true,

  /**
   * Enable/disable System Config tab
   * Shows cron job schedules and Slack alert configurations
   */
  ENABLE_SYSTEM_CONFIG: true,

  /**
   * Enable/disable Payer Treatment Aging in Business View
   * Shows payer-level treatment aging buckets by DoS distance
   */
  ENABLE_PAYER_TREATMENT_AGING: true,

  /**
   * Enable/disable Funnel Metrics tab
   * Shows orders funnel, open orders summary, and auth status breakdown
   */
  ENABLE_FUNNEL_METRICS: true,

  ENABLE_BILLING_ANALYTICS: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
