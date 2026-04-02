/**
 * EmailRouter — provider-agnostic email facade.
 *
 * Strategy:
 *   1. Try Amazon SES (primary) with up to SES_MAX_ATTEMPTS retries.
 *   2. If SES raises a non-retryable error AND Resend is configured
 *      (RESEND_API_KEY is set), fall back to Resend.
 *   3. If Resend is not configured, re-throw the SES error immediately.
 *
 * The caller (queue handler) is responsible for final DLQ behaviour via
 * message.retry() / message.ack().
 */

import { SesService, SesError } from './ses'
import { ResendService, type SendEmailOptions } from './resend'
import { withRetry } from '../lib/retry'

const SES_MAX_ATTEMPTS = 3

export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export interface EmailRouterConfig {
  /** SES credentials — optional */
  ses?: {
    region: string
    accessKeyId: string
    secretAccessKey: string
    fromAddress: string
  } | undefined
  /** Resend credentials — optional */
  resend?: {
    apiKey: string
    fromAddress: string
  } | undefined
  /** Optional display name for 'From' header (e.g. "Leapify") */
  fromName?: string | undefined
}

export class EmailRouter {
  private readonly ses: SesService | null
  private readonly resend: ResendService | null

  constructor(config: EmailRouterConfig) {
    this.ses = config.ses
      ? new SesService({ ...config.ses, fromName: config.fromName })
      : null
    this.resend = config.resend
      ? new ResendService(config.resend.apiKey, formatFrom(config.fromName, config.resend.fromAddress))
      : null
  }

  /**
   * Send a single email.
   * Tries SES first (with retries), then Resend if configured and SES fails permanently.
   */
  async sendEmail(payload: EmailPayload): Promise<{ provider: 'ses' | 'resend'; id: string }> {
    // 1. Try SES if configured
    if (this.ses) {
      try {
        const result = await withRetry(() => this.ses!.sendEmail(payload), {
          maxAttempts: SES_MAX_ATTEMPTS,
          shouldRetry: (err) => !(err instanceof SesError && err.isNonRetryable),
        })
        return { provider: 'ses', id: result.messageId }
      } catch (sesErr) {
        const isPermanent = sesErr instanceof SesError && sesErr.isNonRetryable

        // Fallback to Resend if SES has permanent failure
        if (isPermanent && this.resend) {
          console.warn('[EmailRouter] SES failed permanently — falling back to Resend', sesErr)
          const result = await this.resend.sendEmail(toResendOptions(payload))
          return { provider: 'resend', id: result.id }
        }

        throw sesErr
      }
    }

    // 2. Try Resend if SES is not configured but Resend is
    if (this.resend) {
      const result = await this.resend.sendEmail(toResendOptions(payload))
      return { provider: 'resend', id: result.id }
    }

    // 3. No providers configured
    throw new Error('No email providers (SES or Resend) are configured.')
  }

  /**
   * Send a batch of emails.
   * Each email is routed individually through sendEmail() so per-message
   * fallback logic applies consistently.
   *
   * Returns settled results — partial failures do NOT abort the batch.
   */
  async sendBatch(
    payloads: EmailPayload[],
  ): Promise<PromiseSettledResult<{ provider: 'ses' | 'resend'; id: string }>[]> {
    return Promise.allSettled(payloads.map((p) => this.sendEmail(p)))
  }
}

// ---------------------------------------------------------------------------
// Factory — build an EmailRouter from raw Worker bindings
// ---------------------------------------------------------------------------

export type EmailEnv = {
  SES_REGION?: string
  SES_ACCESS_KEY_ID?: string
  SES_SECRET_ACCESS_KEY?: string
  SES_FROM_ADDRESS?: string
  EMAIL_FROM_NAME?: string
  ALLOWED_ORIGINS?: string
  RESEND_API_KEY?: string
  RESEND_FROM_ADDRESS?: string
}

/**
 * Build an EmailRouter from Cloudflare Worker bindings.
 * Returns null if no email providers are configured.
 */
export function createEmailRouter(env: EmailEnv): EmailRouter | null {
  const hasSes = env.SES_REGION && env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY
  const hasResend = !!env.RESEND_API_KEY

  if (!hasSes && !hasResend) {
    return null
  }

  return new EmailRouter({
    ses: hasSes
      ? {
          region: env.SES_REGION!,
          accessKeyId: env.SES_ACCESS_KEY_ID!,
          secretAccessKey: env.SES_SECRET_ACCESS_KEY!,
          fromAddress: env.SES_FROM_ADDRESS ?? 'noreply@leap.dlsu.edu.ph',
        }
      : undefined,
    fromName: env.EMAIL_FROM_NAME ?? undefined,
    resend: hasResend
      ? {
          apiKey: env.RESEND_API_KEY!,
          fromAddress: env.RESEND_FROM_ADDRESS ?? 'noreply@leap.dlsu.edu.ph',
        }
      : undefined,
  })
}

/**
 * Format email 'From' field as "Name <email@domain.com>" if name provided.
 */
function formatFrom(name: string | undefined, email: string): string {
  if (!name) return email
  return `${name} <${email}>`
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toResendOptions(payload: EmailPayload): SendEmailOptions {
  return {
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    ...(payload.from !== undefined ? { from: payload.from } : {}),
    ...(payload.replyTo !== undefined ? { replyTo: payload.replyTo } : {}),
  }
}
