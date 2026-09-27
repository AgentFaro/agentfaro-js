import { AgentFaroError } from './errors.ts';
import { Leads } from './leads.ts';
import { HttpTransport } from './transport.ts';

export const DEFAULT_BASE_URL = 'https://api.agentfaro.com';

export interface ClientOptions {
  /** Your AgentFaro API key. Defaults to the `AGENTFARO_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `https://api.agentfaro.com`. */
  baseUrl?: string;
  /** How long one attempt may take before it is abandoned. Defaults to 10,000 ms. */
  timeoutMs?: number;
  /** How many times a failed attempt is retried. Defaults to 2. */
  maxRetries?: number;
  /** A fetch implementation to use instead of the global one (for proxies or tests). */
  fetch?: typeof fetch;
  /**
   * An API key sent from a browser is readable by anyone who opens developer tools, so the
   * client refuses to start in one. Set this only if the key in question is meant to be public.
   */
  dangerouslyAllowBrowser?: boolean;
}

/**
 * The AgentFaro client.
 *
 * ```ts
 * const agentfaro = new AgentFaro(); // reads AGENTFARO_API_KEY
 * await agentfaro.leads.create({ name: 'Jordan Rivera', email: 'jordan@example.com' });
 * ```
 */
export class AgentFaro {
  /** Send leads into AgentFaro. */
  readonly leads: Leads;

  constructor(options: ClientOptions = {}) {
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new AgentFaroError(
        'AgentFaro runs on your server, not in the browser, where the API key would be public. ' +
          'Post your form to your own backend and call the SDK there.',
      );
    }
    const apiKey = options.apiKey ?? readEnv('AGENTFARO_API_KEY');
    if (!apiKey) {
      throw new AgentFaroError('No API key. Pass { apiKey } or set the AGENTFARO_API_KEY environment variable.');
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new AgentFaroError('No fetch available. Use Node 20 or later, or pass { fetch }.');
    }
    const transport = new HttpTransport({
      apiKey,
      baseUrl: (options.baseUrl ?? readEnv('AGENTFARO_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
      timeoutMs: nonNegative('timeoutMs', options.timeoutMs, 10_000),
      maxRetries: nonNegative('maxRetries', options.maxRetries, 2),
      fetch: fetchImpl.bind(globalThis),
    });
    this.leads = new Leads(transport);
  }
}

function isBrowser(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown };
  return typeof g.window !== 'undefined' && typeof g.document !== 'undefined';
}

function readEnv(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const value = g.process?.env?.[name]?.trim();
  return value || undefined;
}

function nonNegative(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new AgentFaroError(`${name} must be a number of 0 or more.`);
  }
  return value;
}
