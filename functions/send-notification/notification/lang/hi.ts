import { NotificationStrings } from "../../models.ts";

export const hi: NotificationStrings = {
  billing: (cardName, last4Digits, billingInDays) => {
    let title = "";
    let body = "";
    if (billingInDays === 0) {
      title = `📅 आज बिलिंग दिवस: ${cardName}`;
      body =
        `आपके ${cardName} (**** ${last4Digits}) का नया स्टेटमेंट जल्द ही जेनरेट होगा।`;
    } else if (billingInDays === 1) {
      title = `📅 कल बिलिंग दिवस: ${cardName}`;
      body =
        `${cardName} (**** ${last4Digits}) की बिलिंग तिथि कल है। अपने खर्चों को अंतिम रूप दें।`;
    } else {
      title = `📅 ${billingInDays} दिनों में बिलिंग: ${cardName}`;
      body =
        `${cardName} (**** ${last4Digits}) की बिलिंग तिथि ${billingInDays} दिनों में आ रही है।`;
    }
    return { title, body };
  },
  due: (cardName, last4Digits, dueInDays, remaining) => {
    let title = "";
    if (dueInDays === 0) {
      title = `⏰ आज भुगतान की अंतिम तिथि: ${cardName}`;
    } else if (dueInDays === 1) {
      title = `⏰ कल भुगतान की अंतिम तिथि: ${cardName}`;
    } else {
      title = `⏰ भुगतान के लिए ${dueInDays} दिन शेष: ${cardName}`;
    }
    return {
      title,
      body:
        `कृपया लेट फीस से बचने के लिए अपने कार्ड (**** ${last4Digits}) का ₹${remaining} का भुगतान करें।`,
    };
  },
  overdue: (cardName, last4Digits, remaining) => ({
    title: `⚠️ भुगतान बकाया: ${cardName}`,
    body:
      `आपके ${cardName} (**** ${last4Digits}) का ₹${remaining} का भुगतान बकाया है। कृपया अतिरिक्त शुल्क से बचने के लिए अभी भुगतान करें।`,
  }),
  partial: (cardName, last4Digits, paid, remaining) => ({
    title: `💸 आंशिक भुगतान प्राप्त: ${cardName}`,
    body:
      `₹${paid} के भुगतान के लिए धन्यवाद। आपके ${cardName} (**** ${last4Digits}) पर अभी भी ₹${remaining} बकाया है।`,
  }),
};
