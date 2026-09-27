import { ConnectionError, TimeoutError, errorForStatus } from './errors.ts';
import { VERSION } from './version.ts';

/** Per-call overrides. */
export interface RequestOptions {
  /** Makes retries safe. Defaults to a fresh UUID per call, reused across that call's retries. */
  idempotencyKey?: string;
  /** Cancels the call, including any retry that is waiting. */
  signal?: AbortSignal;
  /** Overrides the client's `timeoutMs` for this call. */
  timeoutMs?: number;
  /** Overrides the client's `maxRetries` for this call. */
  maxRetries?: number;
}

export interface TransportConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof fetch;
}

export interface Transport {
  request<T>(method: string, path: string, body: unknown, options: RequestOptions): Promise<T>;
}

const MAX_RETRY_AFTER_MS = 60_000;

/** Statuses worth another try: the request may succeed unchanged. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export class HttpTransport implements Transport {
  readonly #config: TransportConfig;

  constructor(config: TransportConfig) {
    this.#config = config;
  }

  async request<T>(method: string, path: string, body: unknown, options: RequestOptions): Promise<T> {
    const url = this.#config.baseUrl + path;
    const timeoutMs = options.timeoutMs ?? this.#config.timeoutMs;
    const maxRetries = options.maxRetries ?? this.#config.maxRetries;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#config.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-AgentFaro-Client': `agentfaro-js/${VERSION}`,
    };
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();
      const deadline = withTimeout(options.signal, timeoutMs);
      let response: Response;
      try {
        response = await this.#config.fetch(url, {
          method,
          headers: { ...headers, 'X-AgentFaro-Retry-Count': String(attempt) },
          body: payload,
          signal: deadline.signal,
        });
      } catch (cause) {
        deadline.clear();
        // The caller cancelled: stop now, with their reason.
        options.signal?.throwIfAborted();
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt), options.signal);
          continue;
        }
        throw deadline.timedOut()
          ? new TimeoutError(`${method} ${path} timed out after ${timeoutMs} ms.`, { cause })
          : new ConnectionError(`${method} ${path} failed before a response: ${describe(cause)}`, { cause });
      }
      deadline.clear();

      if (response.ok) {
        return (await response.json()) as T;
      }
      if (isRetryable(response.status) && attempt < maxRetries) {
        // Release the unread body without waiting: on a tee'd or cloned response, cancel()
        // does not settle until every branch is cancelled.
        response.body?.cancel().catch(() => {});
        await sleep(retryAfterMs(response) ?? backoffMs(attempt), options.signal);
        continue;
      }
      throw await toAPIError(response, method, path);
    }
  }
}

async function toAPIError(response: Response, method: string, path: string) {
  const text = await response.text().catch(() => '');
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Not JSON (a proxy's HTML page, say): keep the raw text.
  }
  const detail =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : response.statusText || 'request failed';
  const requestId = response.headers.get('x-request-id') ?? undefined;
  return errorForStatus(response.status, `${method} ${path}: ${response.status} ${detail}`, body, requestId);
}

/** Exponential backoff with jitter: about 0.5 s, 1 s, 2 s … capped at 8 s. */
function backoffMs(attempt: number): number {
  const base = Math.min(8_000, 500 * 2 ** attempt);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/** Reads Retry-After as seconds or an HTTP date. Undefined when absent or unreadable. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms)) return undefined;
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

/** A signal that fires on the caller's abort or after `ms`, whichever comes first. */
function withTimeout(parent: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`Timed out after ${ms} ms`, 'TimeoutError'));
  }, ms);
  const onAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clear() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
