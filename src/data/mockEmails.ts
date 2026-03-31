import type { EmailItem } from "../types/actionDesk";

export const mockEmails: EmailItem[] = [
  {
    id: "email-1001",
    senderName: "Maria Chen",
    senderEmail: "maria.chen@example.com",
    subject: "Checking status for order ORD-1001",
    receivedAt: "2026-03-31T08:12:00Z",
    body: `Hello support,

I am writing to check the status of my order ORD-1001. I have been waiting for several days and still have not received any update. This is getting frustrating, and I would appreciate an update as soon as possible.

Thank you.`,
  },
  {
    id: "email-1002",
    senderName: "Jason Ruiz",
    senderEmail: "jason.ruiz@example.com",
    subject: "POD needed for ORD-1005 delivery",
    receivedAt: "2026-03-31T08:34:00Z",
    body: `Hello support,

Can you please send the proof of delivery for order ORD-1005? Our receiving team needs the POD to confirm who signed for the shipment this morning.

Thank you,
Jason Ruiz`,
  },
  {
    id: "email-1003",
    senderName: "Nina Patel",
    senderEmail: "nina.patel@example.com",
    subject: "Delivered order ORD-1004 not received",
    receivedAt: "2026-03-31T09:05:00Z",
    body: `Hello support,

I am following up on order ORD-1004. The tracking page says it was delivered, but I still have not received the package. I need help figuring out what happened.

Thank you.`,
  },
  {
    id: "email-1004",
    senderName: "Alex Morgan",
    senderEmail: "alex.morgan@example.com",
    subject: "Delay concern for order ORD-1003",
    receivedAt: "2026-03-31T09:47:00Z",
    body: `Hi team,

I am checking on order ORD-1003. There has been no update for days, and I am getting concerned because the shipment appears delayed. Please send the latest status when you can.

Best,
Alex Morgan`,
  },
  {
    id: "email-1005",
    senderName: "Lauren Brooks",
    senderEmail: "lauren.brooks@example.com",
    subject: "Cancel order ORD-1006 before shipment",
    receivedAt: "2026-03-31T10:06:00Z",
    body: `Hi team,

Please cancel order ORD-1006 as soon as possible. We entered the request in error and need to stop it before it ships.

Thanks,
Lauren`,
  },
  {
    id: "email-1006",
    senderName: "Ethan Kim",
    senderEmail: "ethan.kim@example.com",
    subject: "Short shipment on ORD-1007",
    receivedAt: "2026-03-31T10:18:00Z",
    body: `Hello,

We received order ORD-1007 today, but the shipment was short. The packing slip shows 10 units and only 7 units arrived in the carton.

Please advise on the missing items.

Thank you,
Ethan Kim`,
  },
  {
    id: "email-1007",
    senderName: "Priya Nair",
    senderEmail: "priya.nair@example.com",
    subject: "Damaged shipment for ORD-1008",
    receivedAt: "2026-03-31T10:41:00Z",
    body: `Support team,

Order ORD-1008 arrived with damaged product inside. Two units were broken when the shipment was opened, and the outer carton was crushed.

Please let me know the replacement process.

Regards,
Priya`,
  },
  {
    id: "email-1008",
    senderName: "Olivia Reed",
    senderEmail: "olivia.reed@example.com",
    subject: "Address change needed for ORD-1002",
    receivedAt: "2026-03-31T11:02:00Z",
    body: `Hello support,

We need to update the shipping address for order ORD-1002. The suite number was entered incorrectly and the delivery may go to the wrong address if it is not corrected today.

Please confirm if this can still be changed.

Thank you,
Olivia Reed`,
  },
  {
    id: "email-1009",
    senderName: "Marcus Hill",
    senderEmail: "marcus.hill@example.com",
    subject: "Possible duplicate shipment on ORD-1009",
    receivedAt: "2026-03-31T11:26:00Z",
    body: `Hi,

I think order ORD-1009 may have been sent twice. We received one shipment yesterday and just got a second tracking notification for the same order today.

Can you verify whether a duplicate shipment was released?

Best,
Marcus`,
  },
  {
    id: "email-1010",
    senderName: "Sofia Martinez",
    senderEmail: "sofia.martinez@example.com",
    subject: "Invoice discrepancy for ORD-1010",
    receivedAt: "2026-03-31T11:48:00Z",
    body: `Hello accounting support,

I have a billing question on order ORD-1010. The invoice shows an extra freight charge that does not match our quoted amount.

Please review and let me know what caused the difference.

Thanks,
Sofia Martinez`,
  },
  {
    id: "email-1011",
    senderName: "Daniel Foster",
    senderEmail: "daniel.foster@example.com",
    subject: "Where is my order",
    receivedAt: "2026-03-31T12:09:00Z",
    body: `Hello,

Where is my order? I placed it earlier this week and still have not seen any movement, but I do not have the order number in front of me right now.

Please help.

Thank you,
Daniel`,
  },
  {
    id: "email-1012",
    senderName: "Rachel Green",
    senderEmail: "rachel.green@example.com",
    subject: "Need update on ORD-1001 immediately",
    receivedAt: "2026-03-31T12:24:00Z",
    body: `Hello support,

I need an update on order ORD-1001 immediately. We have been waiting for several days with no update and this delay is now impacting our customer commitment.

Please respond ASAP.

Rachel Green`,
  },
];
