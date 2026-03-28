import { eq } from 'drizzle-orm'
import type { LeapifyBindings } from '../types'
import type { LeapifyJob } from './jobs'
import { createDb } from '../db'
import { events } from '../db/schema/events'
import { ResendService, buildReminderEmail } from '../services/resend'
import { GFormsService } from '../services/gforms'

/**
 * CF Queue consumer handler.
 * Export from the consumer repo's worker entry like:
 *
 * ```ts
 * import { createQueueHandler } from 'leapify'
 * export const queue = createQueueHandler
 * ```
 */
export function createQueueHandler(env: LeapifyBindings) {
  return async (batch: MessageBatch<LeapifyJob>): Promise<void> => {
    const db = createDb(env.DB)
    const resend = env.RESEND_API_KEY
      ? new ResendService(env.RESEND_API_KEY, env.RESEND_FROM_ADDRESS ?? 'noreply@leap.dlsu.edu.ph')
      : null
    const gforms = new GFormsService(env.GFORMS_SERVICE_ACCOUNT_JSON)

    for (const message of batch.messages) {
      try {
        await processJob(message.body, { db, resend, gforms })
        message.ack()
      } catch (err) {
        console.error(`[Queue] Failed to process job ${message.body.type}:`, err)
        message.retry()
      }
    }
  }
}

async function processJob(
  job: LeapifyJob,
  services: {
    db: ReturnType<typeof createDb>
    resend: ResendService | null
    gforms: GFormsService
  },
): Promise<void> {
  const { db, resend, gforms } = services

  switch (job.type) {
    case 'send_email': {
      if (!resend) throw new Error('Resend not configured')
      await resend.sendEmail(job.payload)
      break
    }

    case 'send_reminder_email': {
      if (!resend) throw new Error('Resend not configured')

      const event = await db.query.events.findFirst({
        where: eq(events.id, job.payload.eventId),
      })
      if (!event?.gformsId) break

      const emails = await gforms.getRespondentEmails(event.gformsId)
      if (emails.length === 0) break

      const isDay = job.payload.hoursBeforeEvent === 24
      const subject = isDay
        ? `Reminder: "${event.title}" is tomorrow!`
        : `Reminder: "${event.title}" starts in 1 hour!`

      const html = buildReminderEmail(event)

      // Batch send (Resend supports up to 100 per batch)
      const BATCH_SIZE = 100
      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE).map((to) => ({ to, subject, html }))
        await resend.sendBatch(batch)
      }

      // Mark reminder as sent
      if (isDay) {
        await db
          .update(events)
          .set({ reminder24hSent: true })
          .where(eq(events.id, job.payload.eventId))
      } else {
        await db
          .update(events)
          .set({ reminder1hSent: true })
          .where(eq(events.id, job.payload.eventId))
      }
      break
    }

    case 'audit_log': {
      console.log('[Audit]', job.payload.action, job.payload.userId, job.payload.meta)
      break
    }

    case 'notify_batch_release': {
      console.log('[Release] Events published:', job.payload.eventIds.join(', '))
      break
    }

    case 'renew_forms_watch': {
      const renewed = await gforms.renewWatch(job.payload.formId, job.payload.watchId)
      const newExpiry = Math.floor(new Date(renewed.expireTime).getTime() / 1000)
      await db
        .update(events)
        .set({ watchExpiresAt: newExpiry })
        .where(eq(events.gformsId, job.payload.formId))
      break
    }

    case 'snapshot_content': {
      console.log('[Snapshot] Content snapshot triggered at', job.payload.triggeredAt)
      // Contentful → D1 snapshot logic lives in services/snapshot.ts
      // Future: import and call snapshotAllContent(db, contentful)
      break
    }
  }
}
