import { and, eq, lte } from "drizzle-orm";
import type { LeapifyBindings } from "../types";
import { createDb } from "../db";
import { events } from "../db/schema/events";

const SECONDS_IN_24H = 86400;
const SECONDS_IN_1H = 3600;
const WINDOW = 3600; // check events starting within the next hour boundary

/**
 * Cron: every hour (`0 * * * *`)
 *
 * Scans published events for those approaching their start time.
 * Queues send_reminder_email jobs for events within the 24h and 1h windows.
 */
export async function reminderEmails(env: LeapifyBindings): Promise<void> {
  if (!env.EMAIL_QUEUE) {
    console.warn(
      "[reminder-emails] EMAIL_QUEUE binding not configured, skipping.",
    );
    return;
  }

  const db = createDb(env.DB);
  const now = Math.floor(Date.now() / 1000);

  // 24-hour reminders
  const events24h = await db.query.events.findMany({
    where: and(
      eq(events.status, "published"),
      eq(events.reminder24hSent, false),
      lte(events.startsAt, now + SECONDS_IN_24H + WINDOW),
    ),
    columns: { id: true, slug: true, startsAt: true },
  });

  for (const event of events24h) {
    if (!event.startsAt) continue;
    const hoursUntil = (event.startsAt - now) / 3600;
    if (hoursUntil <= 25 && hoursUntil >= 23) {
      await env.EMAIL_QUEUE.send({
        type: "send_reminder_email",
        payload: { eventId: event.id, hoursBeforeEvent: 24 },
      });
    }
  }

  // 1-hour reminders
  const events1h = await db.query.events.findMany({
    where: and(
      eq(events.status, "published"),
      eq(events.reminder1hSent, false),
      lte(events.startsAt, now + SECONDS_IN_1H + WINDOW),
    ),
    columns: { id: true, slug: true, startsAt: true },
  });

  for (const event of events1h) {
    if (!event.startsAt) continue;
    const minutesUntil = (event.startsAt - now) / 60;
    if (minutesUntil <= 65 && minutesUntil >= 55) {
      await env.EMAIL_QUEUE.send({
        type: "send_reminder_email",
        payload: { eventId: event.id, hoursBeforeEvent: 1 },
      });
    }
  }

  console.log(
    `[reminder-emails] Queued ${events24h.length} 24h reminders, ${events1h.length} 1h reminders.`,
  );
}
