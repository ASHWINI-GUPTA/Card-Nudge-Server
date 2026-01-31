import { SupabaseService } from "../../shared/SupabaseService.ts";
import { FirebaseService } from "../services/FirebaseService.ts";
import { NotificationMessageBuilder } from "./NotificationBuilder.ts";
import { Card, NotificationLog, Payment } from "../../shared/models.ts";
import { getDaysDifference } from "../utils/dateUtils.ts";
import { NotificationPolicy } from "./NotificationPolicy.ts";
import { UserContext } from "./UserContext.ts";

export class NotificationSender {
  private policy: NotificationPolicy;

  constructor(
    private supabaseService: SupabaseService,
    private firebaseService: FirebaseService,
    policy?: NotificationPolicy,
  ) {
    this.policy = policy || new NotificationPolicy();
  }

  /**
   * Orchestrates the notification process for a single user.
   */
  async processUserNotifications(
    userId: string,
    now: Date,
    logs: NotificationLog[],
    failedTokens: string[],
  ): Promise<void> {
    const context = await this.buildUserContext(userId);
    if (!context) return;

    const builder = new NotificationMessageBuilder(context.setting.language);

    // Process Payments (Due and Overdue)
    for (const payment of context.payments) {
      await this.processPayment(
        payment,
        context,
        builder,
        now,
        logs,
        failedTokens,
      );
    }

    // Process Billing Cycles
    for (const card of context.cards) {
      await this.processBilling(
        card,
        context,
        builder,
        now,
        logs,
        failedTokens,
      );
    }
  }

  /**
   * Fetches and aggregates all necessary data for the user.
   */
  private async buildUserContext(userId: string): Promise<UserContext | null> {
    const [setting, tokens, payments, cards] = await Promise.all([
      this.supabaseService.getUserSetting(userId),
      this.supabaseService.getDeviceTokens(userId),
      this.supabaseService.getUserPayments(userId),
      this.supabaseService.getUserCards(userId),
    ]);

    if (!setting || !tokens.length) {
      return null;
    }

    return { userId, setting, tokens, payments, cards };
  }

  /**
   * Handles Due and Overdue notifications for a specific payment.
   */
  private async processPayment(
    payment: Payment,
    context: UserContext,
    builder: NotificationMessageBuilder,
    now: Date,
    logs: NotificationLog[],
    failedTokens: string[],
  ): Promise<void> {
    const card = payment.cards;
    const dueDate = new Date(payment.due_date);
    const diffDays = getDaysDifference(now, dueDate);

    // 1. Check Due Reminder
    const lastDueLog = await this.supabaseService.getLastNotificationLog(
      context.userId,
      card.id,
      "due",
    );

    if (this.policy.shouldSendDueReminder(now, dueDate, lastDueLog)) {
      const msg = builder.dueReminder(
        card.name,
        card.last_4_digits,
        diffDays,
        payment.statement_amount,
        context.setting.currency,
        Boolean(card.is_auto_debit_enabled),
      );
      await this.send(
        context,
        card.id,
        "due",
        msg,
        logs,
        failedTokens,
      );
      return; // Prioritize Due over Overdue (though they shouldn't overlap temporally)
    }

    // 2. Check Overdue Reminder
    const lastOverdueLog = await this.supabaseService.getLastNotificationLog(
      context.userId,
      card.id,
      "overdue",
    );

    if (
      this.policy.shouldSendOverdueReminder(now, dueDate, lastOverdueLog)
    ) {
      const msg = builder.overdue(
        card.name,
        card.last_4_digits,
        payment.statement_amount,
        context.setting.currency,
        Boolean(card.is_auto_debit_enabled),
      );
      await this.send(
        context,
        card.id,
        "overdue",
        msg,
        logs,
        failedTokens,
      );
    }
  }

  /**
   * Handles Billing Cycle notifications for a specific card.
   */
  private async processBilling(
    card: Card,
    context: UserContext,
    builder: NotificationMessageBuilder,
    now: Date,
    logs: NotificationLog[],
    failedTokens: string[],
  ): Promise<void> {
    // Skip if there's any unpaid payment for this card (Prioritize Payment over Billing)
    const hasUnpaid = context.payments.some((p) => p.cards?.id === card.id);

    const billingDate = new Date(card.billing_date);

    if (
      this.policy.shouldSendBillingReminder(
        now,
        billingDate,
        hasUnpaid,
      )
    ) {
      const diffDays = getDaysDifference(now, billingDate);
      const msg = builder.billingReminder(
        card.name,
        card.last_4_digits,
        diffDays,
      );
      await this.send(
        context,
        card.id,
        "billing",
        msg,
        logs,
        failedTokens,
      );
    }
  }

  /**
   * Unified sender helper.
   */
  private async send(
    context: UserContext,
    cardId: string,
    type: NotificationLog["notification_type"],
    msg: { title: string; body: string },
    logs: NotificationLog[],
    failedTokens: string[],
  ): Promise<void> {
    const payload = `/card_details/${cardId}`;
    await this.firebaseService.sendNotification(
      context.userId,
      cardId,
      type,
      msg.title,
      msg.body,
      payload,
      context.tokens,
      logs,
      failedTokens,
    );
  }
}
