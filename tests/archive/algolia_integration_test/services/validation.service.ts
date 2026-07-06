/**
 * Validation Service
 *
 * Validates OrderSnapshot data for correctness and completeness
 */

import type { OrderSnapshot } from '../../../src/types/orders';
import type { ValidationResult, ValidationStats } from '../types/algolia.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('Validate');

export class ValidationService {
  /**
   * Validate a single OrderSnapshot
   */
  validateSnapshot(snapshot: OrderSnapshot): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check field presence
    const requiredFields: (keyof OrderSnapshot)[] = [
      'snapshot_timestamp',
      'snapshot_hour_ist',
      'order_id',
      'facility_id',
      'master_auth_status',
      'created_at',
      'created_at_date',
      'is_assigned',
      'is_worked',
    ];

    requiredFields.forEach((field) => {
      if (!(field in snapshot) || snapshot[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate field types
    if (snapshot.order_id && typeof snapshot.order_id !== 'string') {
      errors.push(`order_id must be string, got ${typeof snapshot.order_id}`);
    }

    if (snapshot.facility_id && typeof snapshot.facility_id !== 'string') {
      errors.push(`facility_id must be string, got ${typeof snapshot.facility_id}`);
    }

    if (typeof snapshot.is_assigned !== 'boolean') {
      errors.push(`is_assigned must be boolean, got ${typeof snapshot.is_assigned}`);
    }

    if (typeof snapshot.is_worked !== 'boolean') {
      errors.push(`is_worked must be boolean, got ${typeof snapshot.is_worked}`);
    }

    // Validate date formats
    if (snapshot.created_at && !this.isValidISTTimestamp(snapshot.created_at)) {
      errors.push(`Invalid created_at format: ${snapshot.created_at}`);
    }

    if (snapshot.created_at_date && !this.isValidISTDate(snapshot.created_at_date)) {
      errors.push(`Invalid created_at_date format: ${snapshot.created_at_date}`);
    }

    if (snapshot.snapshot_timestamp && !this.isValidISTTimestamp(snapshot.snapshot_timestamp)) {
      errors.push(`Invalid snapshot_timestamp format: ${snapshot.snapshot_timestamp}`);
    }

    // Validate derived field logic
    if (snapshot.is_assigned && !snapshot.provider_name) {
      errors.push('is_assigned=true but provider_name is null/empty');
    }

    if (!snapshot.is_assigned && snapshot.provider_name && snapshot.provider_name !== 'unassigned') {
      warnings.push('is_assigned=false but provider_name is set');
    }

    if (snapshot.is_worked && !snapshot.date_of_work) {
      errors.push('is_worked=true but date_of_work is null/empty');
    }

    if (!snapshot.is_worked && snapshot.date_of_work) {
      warnings.push('is_worked=false but date_of_work is set');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate an array of OrderSnapshots and return aggregate statistics
   */
  validateSnapshots(snapshots: OrderSnapshot[]): ValidationStats {
    logger.info('Running validation checks...');

    let fieldValidationPass = 0;
    let typeValidationPass = 0;
    let formatValidationPass = 0;
    let derivedLogicPass = 0;
    const issues: string[] = [];

    snapshots.forEach((snapshot, index) => {
      const result = this.validateSnapshot(snapshot);

      if (result.valid) {
        fieldValidationPass++;
        typeValidationPass++;
        formatValidationPass++;
        derivedLogicPass++;
      } else {
        // Categorize errors
        result.errors.forEach((error) => {
          if (error.includes('Missing required field')) {
            // Field validation failed
          } else if (error.includes('must be')) {
            typeValidationPass++;
          } else if (error.includes('Invalid') && error.includes('format')) {
            formatValidationPass++;
          } else if (error.includes('is_assigned') || error.includes('is_worked')) {
            derivedLogicPass++;
          }

          issues.push(`Order ${index} (${snapshot.order_id}): ${error}`);
        });

        if (result.warnings) {
          result.warnings.forEach((warning) => {
            issues.push(`Order ${index} (${snapshot.order_id}) WARNING: ${warning}`);
          });
        }
      }
    });

    const totalOrders = snapshots.length;
    const totalAssigned = snapshots.filter((s) => s.is_assigned).length;
    const totalWorked = snapshots.filter((s) => s.is_worked).length;
    const totalUnassigned = totalOrders - totalAssigned;

    const stats: ValidationStats = {
      total_orders: totalOrders,
      total_assigned: totalAssigned,
      total_worked: totalWorked,
      total_unassigned: totalUnassigned,
      field_validation_pass_rate: (fieldValidationPass / totalOrders) * 100,
      type_validation_pass_rate: (typeValidationPass / totalOrders) * 100,
      format_validation_pass_rate: (formatValidationPass / totalOrders) * 100,
      derived_logic_pass_rate: (derivedLogicPass / totalOrders) * 100,
      issues: issues.slice(0, 20), // Limit to first 20 issues
    };

    // Log results
    logger.success(`Field presence: ${fieldValidationPass}/${totalOrders} (${stats.field_validation_pass_rate.toFixed(1)}%)`);
    logger.success(`Field types: ${typeValidationPass}/${totalOrders} (${stats.type_validation_pass_rate.toFixed(1)}%)`);
    logger.success(`Date formats: ${formatValidationPass}/${totalOrders} (${stats.format_validation_pass_rate.toFixed(1)}%)`);
    logger.success(`Derived logic: ${derivedLogicPass}/${totalOrders} (${stats.derived_logic_pass_rate.toFixed(1)}%)`);
    logger.blank();
    logger.info('Statistics:');
    logger.info(`  Total orders: ${totalOrders}`);
    logger.info(`  Assigned: ${totalAssigned} (${((totalAssigned / totalOrders) * 100).toFixed(1)}%)`);
    logger.info(`  Worked: ${totalWorked} (${((totalWorked / totalOrders) * 100).toFixed(1)}%)`);
    logger.info(`  Unassigned: ${totalUnassigned} (${((totalUnassigned / totalOrders) * 100).toFixed(1)}%)`);

    if (issues.length > 0) {
      logger.blank();
      logger.warn(`Found ${issues.length} issue(s):`);
      issues.slice(0, 10).forEach((issue) => logger.warn(`  ${issue}`));
      if (issues.length > 10) {
        logger.warn(`  ... and ${issues.length - 10} more`);
      }
    }

    return stats;
  }

  /**
   * Validate IST timestamp format: "YYYY-MM-DD HH:MM:SS"
   */
  private isValidISTTimestamp(timestamp: string): boolean {
    if (!timestamp) return false;
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    return regex.test(timestamp);
  }

  /**
   * Validate IST date format: "YYYY-MM-DD"
   */
  private isValidISTDate(date: string): boolean {
    if (!date) return false;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(date);
  }
}

// Export singleton instance
export const validationService = new ValidationService();
