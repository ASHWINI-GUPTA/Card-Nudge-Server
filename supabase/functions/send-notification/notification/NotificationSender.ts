import { SupabaseService } from "../../shared/SupabaseService.ts";
import { FirebaseService } from "../services/FirebaseService.ts";
import { NotificationMessageBuilder } from "./NotificationBuilder.ts";
import { NotificationLog } from "../../shared/models.ts";
import { getDaysDifference } from "../utils/dateUtils.ts";

export class NotificationSender {
  constructor(
    private supabaseService: SupabaseService,
    private firebaseService: FirebaseService,
  ) {}

  async processUserNotifications(
    userId: string,
    now: Date,
    logs: NotificationLog[],
    failedTokens: string[],
  ): Promise<void> {
    // Fetch all necessary data in parallel to minimize latency.
    const [userSetting, tokens, payments, cards] = await Promise.all([
      this.supabaseService.getUserSetting(userId),
      this.supabaseService.getDeviceTokens(userId),
      this.supabaseService.getUserPayments(userId),
      this.supabaseService.getUserCards(userId),
    ]);

    if (!userSetting || !tokens.length) {
      return;
    }

    const lang = userSetting.language;
    const currency = userSetting.currency;
    const builder = new NotificationMessageBuilder(lang);

    for (const payment of payments) {
      const card = payment.cards;
      const remaining = payment.statement_amount;
      const dueDate = new Date(payment.due_date);
      const payload = `/card_details/${card.id}`;
      // Calculate days until due date. Positive for future, 0 for today, negative for past.
      const diffDaysDue = getDaysDifference(now, dueDate);

      // --- ⏰  Due Reminder ---
      if (diffDaysDue === 0) {
        // Due Today
        const msg = builder.dueReminder(
          card.name,
          card.last_4_digits,
          diffDaysDue,
          remaining,
          currency,
          // pass auto-debit flag if available
          Boolean(card.is_auto_debit_enabled),
        );
        await this.firebaseService.sendNotification(
          userId,
          card.id,
          "due",
          msg.title,
          msg.body,
          payload,
          tokens,
          logs,
          failedTokens,
        );
      } else if (diffDaysDue > 0) {
        // Due in the future
        let shouldSendDue = false;
        if (diffDaysDue <= 5) {
          // Always send if due in 5 days or less (including today/tomorrow).
          shouldSendDue = true;
        } else {
          const lastLog = await this.supabaseService.getLastNotificationLog(
            userId,
            card.id,
            "due",
          );
          if (!lastLog) {
            shouldSendDue = true; // Send if no previous due log
          } else {
            const daysSinceLastSend = getDaysDifference(
              new Date(lastLog.sent_at),
              now,
            );
            // More than 5 days out, send every 3 days.
            shouldSendDue = daysSinceLastSend >= 3;
          }
        }

        if (shouldSendDue) {
          const msg = builder.dueReminder(
            card.name,
            card.last_4_digits,
            diffDaysDue,
            remaining,
            currency,
            Boolean(card.is_auto_debit_enabled),
          );
          await this.firebaseService.sendNotification(
            userId,
            card.id,
            "due",
            msg.title,
            msg.body,
            payload,
            tokens,
            logs,
            failedTokens,
          );
        }
      } else {
        // -- ⚠️ Overdue Reminder ---
        const daysOverdue = Math.abs(diffDaysDue);
        let shouldSendOverdue = false;
        if (daysOverdue <= 7) {
          // Overdue for 7 days or less, send every day.
          shouldSendOverdue = true;
        } else {
          const lastLog = await this.supabaseService.getLastNotificationLog(
            userId,
            card.id,
            "overdue",
          );
          if (!lastLog) {
            // Always send if record not available for overdue reminder.
            shouldSendOverdue = true;
          } else {
            const daysSinceLastSend = getDaysDifference(
              new Date(lastLog.sent_at),
              now,
            );
            // Overdue for more than 7 days, send once every 3 days.
            shouldSendOverdue = daysSinceLastSend >= 3;
          }
        }

        if (shouldSendOverdue) {
          const msg = builder.overdue(
            card.name,
            card.last_4_digits,
            remaining,
            currency,
            Boolean(card.is_auto_debit_enabled),
          );
          await this.firebaseService.sendNotification(
            userId,
            card.id,
            "overdue",
            msg.title,
            msg.body,
            payload,
            tokens,
            logs,
            failedTokens,
          );
        }
      }

      // --- 💸 Partial Payment ---
      // AG TODO: Notification for partial payments
    }

    // --- 📅 Billing Reminder ---
    for (const card of cards) {
      // Skip billing notifications for cards that already have an unpaid payment
      const hasUnpaidPayment = payments.some((p) => p.cards?.id === card.id);
      if (hasUnpaidPayment) {
        continue;
      }

      const billingDate = new Date(card.billing_date);
      const diffDaysBilling = getDaysDifference(now, billingDate);
      let shouldSendBilling = false;

      if (diffDaysBilling === 0) {
        shouldSendBilling = true; // Always send on billing day
      } else {
        if (Math.abs(diffDaysBilling) <= 3) {
          shouldSendBilling = true; // Every day for 3 days before/after billing
        } else {
          const lastLog = await this.supabaseService.getLastNotificationLog(
            userId,
            card.id,
            "billing",
          );

          if (!lastLog) {
            shouldSendBilling = true; // Send first reminder if no log exists
          } else {
            const daysSinceLastSend = getDaysDifference(
              new Date(lastLog.sent_at),
              now,
            );

            shouldSendBilling = daysSinceLastSend >= 3; // Once in 3 days
          }
        }
      }

      if (shouldSendBilling) {
        const msg = builder.billingReminder(
          card.name,
          card.last_4_digits,
          diffDaysBilling,
        );
        await this.firebaseService.sendNotification(
          userId,
          card.id,
          "billing",
          msg.title,
          msg.body,
          `/cards/${card.id}`,
          tokens,
          logs,
          failedTokens,
        );
      }
    }
  }
}
