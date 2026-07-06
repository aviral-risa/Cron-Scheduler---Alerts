import { WebClient } from '@slack/web-api';
import { IncomingWebhook } from '@slack/webhook';
import fs from 'fs';
import { SlackConfig } from '../config/slack.config';

/**
 * Slack Upload and Messaging Utilities
 *
 * Shared utilities for uploading images and sending messages to Slack.
 * Abstracts away the complexity of Slack API interactions.
 */

export interface SlackUploadOptions {
  /** Path to the image file to upload */
  imagePath: string;

  /** Channel ID or organization ID */
  channel: string;

  /** Title of the image */
  title: string;

  /** Optional initial comment */
  comment?: string;

  /** Whether to use organization's channel from config (default: true) */
  useOrgChannel?: boolean;

  /** Filename with extension for proper Slack rendering (e.g. 'report.png') */
  filename?: string;

  /** Whether to cleanup (delete) the image file after upload (default: true) */
  cleanup?: boolean;
}

export interface SlackMessageOptions {
  /** Organization ID for webhook lookup */
  orgId: string;

  /** Slack blocks for rich formatting */
  blocks?: any[];

  /** Plain text message (fallback) */
  text?: string;
}

/**
 * Upload an image file to Slack using the bot token
 */
export async function uploadImageToSlack(
  options: SlackUploadOptions
): Promise<void> {
  const {
    imagePath,
    channel,
    title,
    comment,
    useOrgChannel = true,
    filename,
    cleanup = true,
  } = options;

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  try {
    const botToken = SlackConfig.getBotToken();
    const web = new WebClient(botToken);

    // Determine the actual channel ID
    let channelId: string;
    if (useOrgChannel) {
      try {
        channelId = SlackConfig.getChannelId(channel);
      } catch {
        // Fallback to using channel as-is if not found in org config
        channelId = channel;
      }
    } else {
      channelId = channel;
    }

    console.log(`📤 Uploading image to Slack channel ${channelId}...`);

    // Upload file using filesUploadV2
    const result = await web.filesUploadV2({
      channel_id: channelId,
      file: fs.createReadStream(imagePath),
      filename: filename || 'image.png',
      title: title,
      initial_comment: comment,
    });

    if (result.ok) {
      console.log(`✓ Image uploaded successfully to Slack`);
    } else {
      throw new Error(`Slack API error: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Error uploading image to Slack:', error);
    throw error;
  } finally {
    // Cleanup image file if requested
    if (cleanup && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
        console.log(`✓ Cleaned up image file: ${imagePath}`);
      } catch (cleanupError) {
        console.warn(`⚠️  Failed to cleanup image:`, cleanupError);
      }
    }
  }
}

/**
 * Send a message to Slack using webhook (for Block Kit messages)
 */
export async function sendWebhookMessage(
  options: SlackMessageOptions
): Promise<void> {
  const { orgId, blocks, text } = options;

  try {
    const webhookUrl = SlackConfig.getWebhookUrl(orgId);
    const webhook = new IncomingWebhook(webhookUrl);

    console.log(`📤 Sending message to ${orgId} via webhook...`);

    const payload: any = {};
    if (blocks) {
      payload.blocks = blocks;
    }
    if (text) {
      payload.text = text;
    }

    await webhook.send(payload);

    console.log(`✓ Message sent successfully to ${orgId}`);
  } catch (error) {
    console.error(`❌ Error sending message to ${orgId}:`, error);
    throw error;
  }
}

/**
 * Send a Block Kit message to Slack
 */
export async function sendBlockKitMessage(
  orgId: string,
  blocks: any[],
  fallbackText?: string
): Promise<void> {
  return sendWebhookMessage({
    orgId,
    blocks,
    text: fallbackText,
  });
}

/**
 * Send a simple text message to Slack
 */
export async function sendSimpleMessage(
  orgId: string,
  text: string
): Promise<void> {
  return sendWebhookMessage({
    orgId,
    text,
  });
}

/**
 * Send messages to multiple organizations in parallel
 */
export async function sendToMultipleOrgs(
  orgIds: string[],
  messageGenerator: (orgId: string) => Promise<{ blocks?: any[]; text?: string }>
): Promise<{ successful: number; failed: number }> {
  console.log(`🚀 Sending alerts to ${orgIds.length} organizations...`);

  const results = await Promise.allSettled(
    orgIds.map(async (orgId) => {
      const message = await messageGenerator(orgId);
      await sendWebhookMessage({ orgId, ...message });
    })
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Send Summary:');
  console.log(`   ✓ Successful: ${successful}/${orgIds.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${orgIds.length}`);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`     ${orgIds[index]}: ${result.reason}`);
      }
    });
  }

  return { successful, failed };
}

/**
 * Upload images to multiple organizations in parallel
 */
export async function uploadToMultipleOrgs(
  orgIds: string[],
  imageGenerator: (orgId: string) => Promise<{ imagePath: string; title: string; comment?: string }>
): Promise<{ successful: number; failed: number }> {
  console.log(`🚀 Uploading images to ${orgIds.length} organizations...`);

  const results = await Promise.allSettled(
    orgIds.map(async (orgId) => {
      const { imagePath, title, comment } = await imageGenerator(orgId);
      await uploadImageToSlack({
        imagePath,
        channel: orgId,
        title,
        comment,
        useOrgChannel: true,
        cleanup: true,
      });
    })
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log('\n📊 Upload Summary:');
  console.log(`   ✓ Successful: ${successful}/${orgIds.length}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}/${orgIds.length}`);
  }

  return { successful, failed };
}
