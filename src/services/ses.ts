/**
 * Amazon SES (v2) transactional email client.
 *
 * Uses the SES v2 SendEmail REST endpoint with AWS SigV4 signing.
 * Fully fetch-native — no SDK, fully edge-compatible (Cloudflare Workers).
 *
 * Docs: https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
 */

export interface SesEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export interface SesBatchEmailOptions {
  emails: SesEmailOptions[]
}

export class SesService {
  private readonly region: string
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private readonly defaultFrom: string

  constructor(opts: {
    region: string
    accessKeyId: string
    secretAccessKey: string
    fromAddress: string
  }) {
    this.region = opts.region
    this.accessKeyId = opts.accessKeyId
    this.secretAccessKey = opts.secretAccessKey
    this.defaultFrom = opts.fromAddress
  }

  /**
   * Send a single email via SES v2 SendEmail.
   * Throws on any non-2xx response.
   */
  async sendEmail(options: SesEmailOptions): Promise<{ messageId: string }> {
    const toAddresses = Array.isArray(options.to) ? options.to : [options.to]
    const from = options.from ?? this.defaultFrom

    const body = JSON.stringify({
      FromEmailAddress: from,
      Destination: { ToAddresses: toAddresses },
      Content: {
        Simple: {
          Subject: { Data: options.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: options.html, Charset: 'UTF-8' } },
        },
      },
      ...(options.replyTo
        ? { ReplyToAddresses: [options.replyTo] }
        : {}),
    })

    const response = await this._signedFetch('POST', '/v2/email/outbound-emails', body)

    if (!response.ok) {
      const err = await response.text()
      throw new SesError(response.status, err)
    }

    const data = (await response.json()) as { MessageId: string }
    return { messageId: data.MessageId }
  }

  /**
   * Send a batch of emails sequentially (SES v2 has no native batch endpoint).
   * Each message is sent individually; partial failure does NOT abort remaining sends.
   * Returns settled results so the caller can decide what to do with failures.
   */
  async sendBatch(emails: SesEmailOptions[]): Promise<PromiseSettledResult<{ messageId: string }>[]> {
    return Promise.allSettled(emails.map((e) => this.sendEmail(e)))
  }

  // ---------------------------------------------------------------------------
  // SigV4 signing
  // ---------------------------------------------------------------------------

  private async _signedFetch(method: string, path: string, body: string): Promise<Response> {
    const url = `https://email.${this.region}.amazonaws.com${path}`
    const now = new Date()
    const amzDate = formatAmzDate(now)
    const dateStamp = amzDate.slice(0, 8)
    const host = `email.${this.region}.amazonaws.com`
    const service = 'ses'

    const payloadHash = await sha256Hex(body)

    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'content-type;host;x-amz-date'

    const canonicalRequest = [
      method,
      path,
      '', // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n')

    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n')

    const signingKey = await getSigningKey(this.secretAccessKey, dateStamp, this.region, service)
    const signature = await hmacHex(signingKey, stringToSign)

    const authHeader =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`

    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate,
        Authorization: authHeader,
      },
      body,
    })
  }
}

// ---------------------------------------------------------------------------
// SES-specific error — carries the HTTP status so callers can classify it
// ---------------------------------------------------------------------------

export class SesError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`SES error ${status}: ${message}`)
    this.name = 'SesError'
  }

  /**
   * True for errors that are permanent (not worth retrying via SES again).
   * 400 BadRequest, 403 Forbidden, 404 NotFound → non-retryable.
   * 429 ThrottlingException, 5xx → retryable.
   */
  get isNonRetryable(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429
  }
}

// ---------------------------------------------------------------------------
// SigV4 crypto helpers (Web Crypto API — available in CF Workers)
// ---------------------------------------------------------------------------

function formatAmzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return bufToHex(hashBuffer)
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  return bufToHex(sig)
}

async function hmacBuffer(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function getSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const secretBytes = new TextEncoder().encode(`AWS4${secret}`)
  // Slice to get a plain ArrayBuffer (TextEncoder returns Uint8Array<ArrayBufferLike>)
  const kDate = await hmacBuffer(secretBytes.buffer.slice(0) as ArrayBuffer, dateStamp)
  const kRegion = await hmacBuffer(kDate, region)
  const kService = await hmacBuffer(kRegion, service)
  return hmacBuffer(kService, 'aws4_request')
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
