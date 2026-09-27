/** Base class for every error this SDK throws. `instanceof AgentFaroError` catches them all. */
export class AgentFaroError extends Error {
  override name = 'AgentFaroError';
}

/** A lead failed validation before it was sent. `field` names the offending input. */
export class ValidationError extends AgentFaroError {
  override name = 'ValidationError';
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

/** The request never got an HTTP response (DNS, TLS, reset connection). Retried before it is thrown. */
export class ConnectionError extends AgentFaroError {
  override name = 'ConnectionError';
}

/** The request took longer than `timeoutMs`. Retried before it is thrown. */
export class TimeoutError extends ConnectionError {
  override name = 'TimeoutError';
}

/** The API answered with an error status. Subclasses narrow it by status code. */
export class APIError extends AgentFaroError {
  override name = 'APIError';
  /** The HTTP status code. */
  readonly status: number;
  /** The request ID the API assigned, when it sent one. Quote it when you contact support. */
  readonly requestId: string | undefined;
  /** The parsed response body, or the raw text when it was not JSON. */
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown, requestId: string | undefined) {
    super(message);
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

/** 400: the API rejected the lead's fields. */
export class BadRequestError extends APIError {
  override name = 'BadRequestError';
}

/** 401: the API key is missing, malformed, or revoked. */
export class AuthenticationError extends APIError {
  override name = 'AuthenticationError';
}

/** 403: the key is valid but may not act on this site. */
export class PermissionDeniedError extends APIError {
  override name = 'PermissionDeniedError';
}

/** 404: the site named in `site` does not exist on this account. */
export class NotFoundError extends APIError {
  override name = 'NotFoundError';
}

/** 409: the idempotency key was already used with a different lead. */
export class ConflictError extends APIError {
  override name = 'ConflictError';
}

/** 429: too many requests. Retried with the API's Retry-After before it is thrown. */
export class RateLimitError extends APIError {
  override name = 'RateLimitError';
}

/** 5xx: the API failed. Retried before it is thrown. */
export class InternalServerError extends APIError {
  override name = 'InternalServerError';
}

export function errorForStatus(
  status: number,
  message: string,
  body: unknown,
  requestId: string | undefined,
): APIError {
  switch (status) {
    case 400:
      return new BadRequestError(status, message, body, requestId);
    case 401:
      return new AuthenticationError(status, message, body, requestId);
    case 403:
      return new PermissionDeniedError(status, message, body, requestId);
    case 404:
      return new NotFoundError(status, message, body, requestId);
    case 409:
      return new ConflictError(status, message, body, requestId);
    case 429:
      return new RateLimitError(status, message, body, requestId);
    default:
      return status >= 500
        ? new InternalServerError(status, message, body, requestId)
        : new APIError(status, message, body, requestId);
  }
}
