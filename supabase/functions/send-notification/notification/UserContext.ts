import { Card, Payment, Setting } from "../../shared/models.ts";

export interface UserContext {
  userId: string;
  setting: Setting;
  tokens: string[];
  payments: Payment[];
  cards: Card[];
}
