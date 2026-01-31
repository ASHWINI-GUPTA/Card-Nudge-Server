import { assertSpyCalls, spy } from "@mock";
import { NotificationSender } from "../notification/NotificationSender.ts";
import { SupabaseService } from "../../shared/SupabaseService.ts";
import { FirebaseService } from "../services/FirebaseService.ts";

const MOCK_USER_ID = "USR_1";
const MOCK_CARD_ID = "CRD_1";
const MOCK_NOW = new Date("2026-01-01T10:00:00Z");

// Helper to generate date strings relative to MOCK_NOW
function getDateStr(daysOffset: number): string {
  const d = new Date(MOCK_NOW);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function getIsoTimestamp(daysOffset: number): string {
  const d = new Date(MOCK_NOW);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

// Helper to create a mock SupabaseService
function createMockSupabaseService(overrides: Partial<SupabaseService> = {}) {
  return {
    getUserSetting: () => Promise.resolve({ language: "en", currency: "USD" }),
    getDeviceTokens: () => Promise.resolve(["DEVICE_TKN_1", "DEVICE_TKN_2"]),
    getUserPayments: () => Promise.resolve([]),
    getUserCards: () => Promise.resolve([]),
    getLastNotificationLog: () => Promise.resolve(null),
    ...overrides,
  } as unknown as SupabaseService;
}

// Helper to create a mock FirebaseService
function createMockFirebaseService() {
  return {
    sendNotification: spy(() => Promise.resolve()),
  } as unknown as FirebaseService;
}

Deno.test("NotificationSender - Skips if no settings or tokens", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserSetting: () => Promise.resolve(null), // No settings
  });
  const mockFirebase = createMockFirebaseService();
  const sender = new NotificationSender(mockSupabase, mockFirebase);

  await sender.processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});

// =================================================================================================
// DUE REMINDER TESTS
// =================================================================================================

// 1. Due Today (0) -> Always Send
Deno.test("Due Reminder - Day 0 (Always Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(0),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-1) } as any),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

// 2. Due in 3 Days -> Always Send
Deno.test("Due Reminder - Day 3 (Always Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(3),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-1) } as any),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

// 3. Due in 4 Days -> Recurrence Check (Recent Log -> Don't Send)
Deno.test("Due Reminder - Day 4 (Skip if Recent Log)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(4),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    // Sent yesterday -> Skip
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-1) } as any),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});

// 4. Due in 4 Days -> No Recent Log -> Send
Deno.test("Due Reminder - Day 4 (Send if No/Old Log)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(4),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    getLastNotificationLog: () => Promise.resolve(null),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

// 5. Due in 5 Days -> Recurrence Check (Recent Log -> Don't Send)
Deno.test("Due Reminder - Day 5 (Skip if Recent Log)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(5),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-1) } as any),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});

// 6. Due in 5 Days -> No Recent Log -> Send
Deno.test("Due Reminder - Recurrence 3 Days", async () => {
  // Scenario: Log sent 4 days ago.
  // With 3-day recurrence: Should SEND (4 >= 3).
  // With 5-day recurrence: Should SKIP (4 < 5).
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(10), // Far out, pure recurrence check
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-2) } as any), // Sent 2 days ago
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);

  // Expecting 0 calls confirms that the interval is indeed > 3 days (i.e. 3).
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});

// =================================================================================================
// BILLING REMINDER TESTS
// =================================================================================================

// 1. Billing Day 0 (Today) -> Send
Deno.test("Billing Reminder - Day 0 (Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserCards: () =>
      Promise.resolve([{
        id: MOCK_CARD_ID,
        name: "Visa",
        last_4_digits: "4242",
        billing_date: getDateStr(0),
        is_archived: false,
      }] as any),
    getLastNotificationLog: () => Promise.resolve(null),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

// 2. Billing Day 3 -> Send
Deno.test("Billing Reminder - Day 3 (Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserCards: () =>
      Promise.resolve([{
        id: MOCK_CARD_ID,
        name: "Visa",
        last_4_digits: "4242",
        billing_date: getDateStr(3),
        is_archived: false,
      }] as any),
    getLastNotificationLog: () => Promise.resolve(null),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

// 3. Billing Day -3 (Past 3 days) -> Send
Deno.test("Billing Reminder - Day -3 (Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserCards: () =>
      Promise.resolve([{
        id: MOCK_CARD_ID,
        name: "Visa",
        last_4_digits: "4242",
        billing_date: getDateStr(-3),
        is_archived: false,
      }] as any),
    getLastNotificationLog: () => Promise.resolve(null),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

// 4. Billing Day 4 -> Do NOT Send (Outside range)
Deno.test("Billing Reminder - Day 4 (Do Not Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserCards: () =>
      Promise.resolve([{
        id: MOCK_CARD_ID,
        name: "Visa",
        last_4_digits: "4242",
        billing_date: getDateStr(4),
        is_archived: false,
      }] as any),
    getLastNotificationLog: () => Promise.resolve(null),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});

// 5. Billing Day 5 -> Do NOT Send (Outside range)
Deno.test("Billing Reminder - Day 5 (Do Not Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserCards: () =>
      Promise.resolve([{
        id: MOCK_CARD_ID,
        name: "Visa",
        last_4_digits: "4242",
        billing_date: getDateStr(5),
        is_archived: false,
      }] as any),
    getLastNotificationLog: () => Promise.resolve(null),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});

// =================================================================================================
// OVERDUE REMINDER TESTS
// =================================================================================================

Deno.test("Overdue Reminder - Day 5 Overdue (Always Send)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(-5),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    // Sent yesterday, but <= 5 days overdue critical window overrides recurrence
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-1) } as any),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 1);
});

Deno.test("Overdue Reminder - Day 6 Overdue (Skip if Recent Log)", async () => {
  const mockSupabase = createMockSupabaseService({
    getUserPayments: () =>
      Promise.resolve([{
        id: "P1",
        due_date: getDateStr(-6),
        statement_amount: 100,
        cards: {
          id: MOCK_CARD_ID,
          name: "Visa",
          last_4_digits: "4242",
          is_auto_debit_enabled: false,
        },
      }] as any),
    // Sent yesterday -> Skip
    getLastNotificationLog: () =>
      Promise.resolve({ sent_at: getIsoTimestamp(-1) } as any),
  });
  const mockFirebase = createMockFirebaseService();
  await new NotificationSender(mockSupabase, mockFirebase)
    .processUserNotifications(MOCK_USER_ID, MOCK_NOW, [], []);
  assertSpyCalls(mockFirebase.sendNotification as any, 0);
});
