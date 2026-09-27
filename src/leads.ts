import { ValidationError } from './errors.ts';
import type { RequestOptions, Transport } from './transport.ts';

/** A person who got in touch: a buyer, a seller, a renter, a neighbor with a question. */
export interface LeadCreateParams {
  /** Their name. Required, at most 200 characters. */
  name: string;
  /** Their email address. Required, at most 254 characters. */
  email: string;
  /** Their phone number, in any format. At most 50 characters. */
  phone?: string;
  /** What they wrote. At most 5,000 characters. */
  message?: string;
  /**
   * The site this lead belongs to, as its AgentFaro site ID or its hostname
   * (`www.example.com`). Only needed when your account runs more than one site.
   */
  site?: string;
  /** The page they were on when they got in touch. At most 2,048 characters. */
  sourceUrl?: string;
  /** The page that sent them to your site. At most 2,048 characters. */
  referrer?: string;
}

/** The API's receipt for a lead. */
export interface Lead {
  /** The lead's ID in AgentFaro. */
  id: string;
  /** Always `accepted`: the lead is stored and on its way to the agent's dashboard. */
  status: 'accepted';
}

/** The body the API receives. snake_case on the wire, like the rest of the intake API. */
export interface LeadWire {
  name: string;
  email: string;
  phone?: string;
  message?: string;
  site?: string;
  source_url?: string;
  referrer?: string;
}

const LIMITS = {
  name: 200,
  email: 254,
  phone: 50,
  message: 5000,
  site: 253,
  sourceUrl: 2048,
  referrer: 2048,
} as const satisfies Record<keyof LeadCreateParams, number>;

/**
 * Checks a lead against the same rules the API applies, so a bad lead fails fast and locally
 * instead of costing a round trip. Returns the wire body with every string trimmed.
 */
export function toLeadWire(params: LeadCreateParams): LeadWire {
  if (params === null || typeof params !== 'object') {
    throw new ValidationError('params', 'Pass the lead as an object.');
  }
  const name = requiredString(params, 'name');
  const email = requiredString(params, 'email').toLowerCase();
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1 || email.includes(' ')) {
    throw new ValidationError('email', `"${email}" is not an email address.`);
  }

  const wire: LeadWire = { name, email };
  const phone = optionalString(params, 'phone');
  if (phone) wire.phone = phone;
  const message = optionalString(params, 'message');
  if (message) wire.message = message;
  const site = optionalString(params, 'site');
  if (site) wire.site = site;
  const sourceUrl = optionalString(params, 'sourceUrl');
  if (sourceUrl) wire.source_url = sourceUrl;
  const referrer = optionalString(params, 'referrer');
  if (referrer) wire.referrer = referrer;
  return wire;
}

function requiredString(params: LeadCreateParams, field: 'name' | 'email'): string {
  const value = optionalString(params, field);
  if (!value) throw new ValidationError(field, `${field} is required.`);
  return value;
}

function optionalString(params: LeadCreateParams, field: keyof LeadCreateParams): string {
  const raw: unknown = params[field];
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') {
    throw new ValidationError(field, `${field} must be a string.`);
  }
  const value = raw.trim();
  if (value.length > LIMITS[field]) {
    throw new ValidationError(field, `${field} is ${value.length} characters; the limit is ${LIMITS[field]}.`);
  }
  return value;
}

/** `client.leads`: send leads into AgentFaro. */
export class Leads {
  readonly #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /**
   * Sends one lead. It lands in the agent's AgentFaro dashboard next to the leads their own
   * site captures, with the same spam scoring and repeat detection.
   *
   * Retries are safe: every call carries an idempotency key, reused on each retry, so a lead
   * that reached the API before a timeout is not stored twice. Pass your own `idempotencyKey`
   * (a form submission ID, say) to make your own retries safe too.
   */
  async create(params: LeadCreateParams, options: RequestOptions = {}): Promise<Lead> {
    const body = toLeadWire(params);
    return this.#transport.request<Lead>('POST', '/v1/leads', body, {
      ...options,
      idempotencyKey: options.idempotencyKey ?? globalThis.crypto.randomUUID(),
    });
  }
}
