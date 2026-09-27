# AgentFaro JavaScript SDK

[![npm](https://img.shields.io/npm/v/@agentfaro/sdk.svg)](https://www.npmjs.com/package/@agentfaro/sdk)
[![ci](https://github.com/AgentFaro/agentfaro-js/actions/workflows/ci.yml/badge.svg)](https://github.com/AgentFaro/agentfaro-js/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/AgentFaro/agentfaro-js/blob/main/LICENSE)

Send leads from any website form or server into [AgentFaro](https://agentfaro.com), the AI-search
marketing service for residential real estate agents.

> **Preview.** This SDK defines the AgentFaro Lead Intake API. The API and the keys it needs are
> not issued yet. Watch this repository to hear when they are. Sites that AgentFaro builds
> already deliver their leads to the agent's dashboard without it.

## Why

An AgentFaro client's own website sends its leads straight to their dashboard at
[os.agentfaro.com](https://os.agentfaro.com). Plenty of leads start somewhere else: an IDX search
site, a landing page builder, an open house sign-in app, a brokerage portal. One call puts them
in the same inbox, with the same spam scoring and repeat detection.

## Install

Node.js 20 or later.

```sh
npm install @agentfaro/sdk
```

## Quick start

```ts
import { AgentFaro } from '@agentfaro/sdk';

const agentfaro = new AgentFaro(); // reads AGENTFARO_API_KEY

const lead = await agentfaro.leads.create({
  name: 'Jordan Rivera',
  email: 'jordan@example.com',
  phone: '(312) 555-0142',
  message: 'Looking at two-bedroom condos near the lake this spring.',
  sourceUrl: 'https://www.example.com/contact/',
});

console.log(lead.id); // the lead's ID in AgentFaro
```

## Forward a website form

Keep the key on your server: the form posts to your own route, and the route calls AgentFaro. A
Next.js route handler:

```ts
// app/api/lead/route.ts
import { AgentFaro, ValidationError } from '@agentfaro/sdk';

const agentfaro = new AgentFaro();

export async function POST(request: Request) {
  const form = await request.formData();
  try {
    await agentfaro.leads.create({
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      message: String(form.get('message') ?? ''),
      sourceUrl: request.headers.get('referer') ?? undefined,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ ok: false, field: error.field, message: error.message }, { status: 400 });
    }
    throw error;
  }
}
```

More in [`examples/`](https://github.com/AgentFaro/agentfaro-js/tree/main/examples).

## Lead fields

| Field | Required | Limit | Notes |
|---|---|---|---|
| `name` | yes | 200 | |
| `email` | yes | 254 | Stored lowercase. |
| `phone` | | 50 | Any format. |
| `message` | | 5,000 | What they wrote. |
| `site` | | | The site the lead belongs to, as its AgentFaro site ID or its hostname. Only needed when your account runs more than one site. |
| `sourceUrl` | | 2,048 | The page they were on. |
| `referrer` | | 2,048 | The page that sent them to your site. |

Every string is trimmed. A lead that breaks a rule throws `ValidationError` before anything is sent,
with `error.field` naming the input.

## Retries and duplicates

A call that fails with a timeout, a dropped connection, a `408`, a `429` or a `5xx` is retried
twice, backing off from half a second and honoring the API's `Retry-After`. Every call carries an
`Idempotency-Key`, the same one on each retry, so a lead that reached AgentFaro before the
connection dropped is stored once.

Your own retries can be safe too. Pass a key that is stable for the submission:

```ts
await agentfaro.leads.create(lead, { idempotencyKey: submission.id });
```

## Errors

Everything the SDK throws extends `AgentFaroError`.

| Class | When |
|---|---|
| `ValidationError` | The lead broke a rule. Nothing was sent. |
| `BadRequestError` | `400`: the API rejected the lead. |
| `AuthenticationError` | `401`: the key is missing, wrong, or revoked. |
| `PermissionDeniedError` | `403`: the key cannot act on that site. |
| `NotFoundError` | `404`: no such site on this account. |
| `ConflictError` | `409`: the idempotency key was already used for a different lead. |
| `RateLimitError` | `429`, after retries. |
| `InternalServerError` | `5xx`, after retries. |
| `ConnectionError` | No response, after retries. |
| `TimeoutError` | An attempt ran past `timeoutMs`, after retries. |

API errors carry `status`, the parsed `body`, and `requestId` when the API sent one.

## Configuration

```ts
const agentfaro = new AgentFaro({
  apiKey: 'af_live_…',        // default: AGENTFARO_API_KEY
  baseUrl: 'https://api.agentfaro.com',
  timeoutMs: 10_000,          // per attempt
  maxRetries: 2,
  fetch: customFetch,         // default: the global fetch
});
```

`timeoutMs`, `maxRetries`, `signal` and `idempotencyKey` can also be set per call, as the second
argument to `leads.create`.

## The key stays on the server

The client refuses to start in a browser, because a key shipped to a browser can be read by anyone
who opens developer tools. Post the form to your own backend and call the SDK there. The
`dangerouslyAllowBrowser` option exists for keys that are meant to be public; lead keys are not.

## Development

```sh
npm install   # also builds dist/
npm test      # Node runs the TypeScript tests directly
npm run typecheck
```

## About AgentFaro

AgentFaro gets residential real estate agents recommended by ChatGPT, Perplexity, Gemini, Google
AI Overviews, Google search and the map pack, and reports the results with hard numbers every
month. **Be the agent AI recommends.** [agentfaro.com](https://agentfaro.com)

## License

[MIT](https://github.com/AgentFaro/agentfaro-js/blob/main/LICENSE)
