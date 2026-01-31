import { NotificationLog } from "../../shared/models.ts";
import { getDaysDifference } from "../utils/dateUtils.ts";

export class NotificationPolicy {
  private static readonly DUE_SOON_THRESHOLD_DAYS = 3;
  private static readonly RECURRENCE_DAYS = 3;
  private static readonly OVERDUE_CRITICAL_THRESHOLD_DAYS = 5;
  private static readonly BILLING_NEAR_THRESHOLD_DAYS = 3;

  /**
   * Determines if a 'Due' notification should be sent.
   */
  shouldSendDueReminder(
    now: Date,
    dueDate: Date,
    lastLog: NotificationLog | null,
  ): boolean {
    const diffDays = getDaysDifference(now, dueDate);

    // If already overdue (diff < 0), this is not a 'Due' reminder case.
    if (diffDays < 0) return false;

    // 1. Due Today (0) or within 3 days -> Send Always
    if (diffDays <= NotificationPolicy.DUE_SOON_THRESHOLD_DAYS) return true;

    // 2. Due later (> 3 days) -> Check recurrence
    return this.checkRecurrence(now, lastLog);
  }

  /**
   * Determines if an 'Overdue' notification should be sent.
   */
  shouldSendOverdueReminder(
    now: Date,
    dueDate: Date,
    lastLog: NotificationLog | null,
  ): boolean {
    const diffDays = getDaysDifference(now, dueDate);

    // If not overdue (diff >= 0), return false
    if (diffDays >= 0) return false;

    const daysOverdue = Math.abs(diffDays);

    // 1. Critical Overdue (<= 5 days) -> Send Daily (Always)
    if (daysOverdue <= NotificationPolicy.OVERDUE_CRITICAL_THRESHOLD_DAYS) {
      return true;
    }

    // 2. Long Overdue (> 5 days) -> Check recurrence
    return this.checkRecurrence(now, lastLog);
  }

  /**
   * Determines if a 'Billing' reminder should be sent.
   */
  shouldSendBillingReminder(
    now: Date,
    billingDate: Date,
    hasUnpaidPayment: boolean,
  ): boolean {
    if (hasUnpaidPayment) return false;

    const diffDays = getDaysDifference(now, billingDate);

    // 1. Billing day (0) or within range (+/- 3 days) -> Send Daily
    if (
      Math.abs(diffDays) <= NotificationPolicy.BILLING_NEAR_THRESHOLD_DAYS
    ) {
      return true;
    }

    // 2. Outside range -> Do not send
    return false;
  }

  /**
   * Helper to check if enough days have passed since the last notification.
   */
  private checkRecurrence(
    now: Date,
    lastLog: NotificationLog | null,
    interval: number = NotificationPolicy.RECURRENCE_DAYS,
  ): boolean {
    // If no prior log, allow sending
    if (!lastLog) return true;
    const daysSinceLast = getDaysDifference(new Date(lastLog.sent_at), now);
    return daysSinceLast >= interval;
  }
}
