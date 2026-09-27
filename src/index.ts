export { AgentFaro, DEFAULT_BASE_URL } from './client.ts';
export type { ClientOptions } from './client.ts';
export { Leads, toLeadWire } from './leads.ts';
export type { Lead, LeadCreateParams, LeadWire } from './leads.ts';
export type { RequestOptions } from './transport.ts';
export {
  AgentFaroError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  ConnectionError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from './errors.ts';
export { VERSION } from './version.ts';

import { AgentFaro } from './client.ts';
export default AgentFaro;
