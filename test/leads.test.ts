import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AgentFaro,
  AuthenticationError,
  BadRequestError,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from '../src/index.ts';
import { ACCEPTED, LEAD, hang, json, scriptedFetch } from './helpers.ts';

const KEY = 'af_test_0000000000000000';

describe('leads.create', () => {
  it('posts the lead in wire shape with the key and an idempotency key', async () => {
    const { fetch, calls } = scriptedFetch(json(202, ACCEPTED));
    const client = new AgentFaro({ apiKey: KEY, fetch });

    const lead = await client.leads.create(LEAD);

    assert.deepEqual(lead, ACCEPTED);
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call?.url, 'https://api.agentfaro.com/v1/leads');
    assert.equal(call?.init.method, 'POST');
    assert.equal(call?.headers.Authorization, `Bearer ${KEY}`);
    assert.match(call?.headers['Idempotency-Key'] ?? '', /^[0-9a-f-]{36}$/);
    assert.match(call?.headers['X-AgentFaro-Client'] ?? '', /^agentfaro-js\/\d+\.\d+\.\d+/);
    assert.deepEqual(call?.body, {
      name: 'Jordan Rivera',
      email: 'jordan@example.com',
      phone: '(312) 555-0142',
      message: 'Looking at two-bedroom condos near the lake this spring.',
      source_url: 'https://www.example.com/contact/',
    });
  });

  it('uses the idempotency key it is given', async () => {
    const { fetch, calls } = scriptedFetch(json(202, ACCEPTED));
    const client = new AgentFaro({ apiKey: KEY, fetch });

    await client.leads.create(LEAD, { idempotencyKey: 'form-submission-8841' });

    assert.equal(calls[0]?.headers['Idempotency-Key'], 'form-submission-8841');
  });

  it('honors a custom base URL', async () => {
    const { fetch, calls } = scriptedFetch(json(202, ACCEPTED));
    const client = new AgentFaro({ apiKey: KEY, fetch, baseUrl: 'http://localhost:8081/' });

    await client.leads.create(LEAD);

    assert.equal(calls[0]?.url, 'http://localhost:8081/v1/leads');
  });

  it('sends the site when one is named', async () => {
    const { fetch, calls } = scriptedFetch(json(202, ACCEPTED));
    const client = new AgentFaro({ apiKey: KEY, fetch });

    await client.leads.create({ name: 'Sam', email: 'sam@example.com', site: 'www.example.com' });

    assert.deepEqual(calls[0]?.body, { name: 'Sam', email: 'sam@example.com', site: 'www.example.com' });
  });
});

describe('validation', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['a missing name', { email: 'sam@example.com' }, 'name'],
    ['a blank name', { name: '   ', email: 'sam@example.com' }, 'name'],
    ['a missing email', { name: 'Sam' }, 'email'],
    ['an email without @', { name: 'Sam', email: 'sam.example.com' }, 'email'],
    ['an email with nothing after @', { name: 'Sam', email: 'sam@' }, 'email'],
    ['a name over 200 characters', { name: 'x'.repeat(201), email: 'sam@example.com' }, 'name'],
    ['a message over 5,000 characters', { name: 'Sam', email: 'sam@example.com', message: 'x'.repeat(5001) }, 'message'],
    ['a phone that is not a string', { name: 'Sam', email: 'sam@example.com', phone: 3125550142 }, 'phone'],
  ];

  for (const [label, params, field] of cases) {
    it(`rejects ${label} without calling the API`, async () => {
      const { fetch, calls } = scriptedFetch(json(202, ACCEPTED));
      const client = new AgentFaro({ apiKey: KEY, fetch });

      await assert.rejects(
        client.leads.create(params as never),
        (error: unknown) => error instanceof ValidationError && error.field === field,
      );
      assert.equal(calls.length, 0);
    });
  }
});

describe('retries', () => {
  it('retries a 503 with the same idempotency key, then succeeds', async () => {
    const { fetch, calls } = scriptedFetch(
      json(503, { error: 'unavailable' }, { 'retry-after': '0' }),
      json(202, ACCEPTED),
    );
    const client = new AgentFaro({ apiKey: KEY, fetch });

    assert.deepEqual(await client.leads.create(LEAD), ACCEPTED);

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.headers['Idempotency-Key'], calls[1]?.headers['Idempotency-Key']);
    assert.equal(calls[1]?.headers['X-AgentFaro-Retry-Count'], '1');
  });

  it('retries when the fetch hands back cloned responses', async () => {
    // A cloned body's cancel() never settles while its twin is unread; waiting on it hung retries.
    const unavailable = new Response('{"error":"unavailable"}', { status: 503, headers: { 'retry-after': '0' } });
    const { fetch, calls } = scriptedFetch(async () => unavailable.clone(), async () => new Response(JSON.stringify(ACCEPTED), { status: 202 }));
    const client = new AgentFaro({ apiKey: KEY, fetch });

    assert.deepEqual(await client.leads.create(LEAD), ACCEPTED);
    assert.equal(calls.length, 2);
  });

  it('gives up on a 429 after maxRetries and throws RateLimitError', async () => {
    const { fetch, calls } = scriptedFetch(json(429, { error: 'rate limited' }, { 'retry-after': '0' }));
    const client = new AgentFaro({ apiKey: KEY, fetch, maxRetries: 2 });

    await assert.rejects(client.leads.create(LEAD), (error: unknown) => {
      assert.ok(error instanceof RateLimitError);
      assert.equal(error.status, 429);
      assert.match(error.message, /rate limited/);
      return true;
    });
    assert.equal(calls.length, 3);
  });

  it('does not retry a 401', async () => {
    const { fetch, calls } = scriptedFetch(json(401, { error: 'invalid api key' }));
    const client = new AgentFaro({ apiKey: KEY, fetch });

    await assert.rejects(client.leads.create(LEAD), AuthenticationError);
    assert.equal(calls.length, 1);
  });

  it('maps a 400 and a 404 to their errors, keeping the body and request ID', async () => {
    const bad = scriptedFetch(json(400, { error: 'email is required' }, { 'x-request-id': 'req_123' }));
    await assert.rejects(new AgentFaro({ apiKey: KEY, fetch: bad.fetch }).leads.create(LEAD), (error: unknown) => {
      assert.ok(error instanceof BadRequestError);
      assert.equal(error.requestId, 'req_123');
      assert.deepEqual(error.body, { error: 'email is required' });
      return true;
    });

    const missing = scriptedFetch(json(404, { error: 'unknown site' }));
    await assert.rejects(new AgentFaro({ apiKey: KEY, fetch: missing.fetch }).leads.create(LEAD), NotFoundError);
  });

  it('retries a dropped connection, then throws ConnectionError', async () => {
    const { fetch, calls } = scriptedFetch(new TypeError('fetch failed'));
    const client = new AgentFaro({ apiKey: KEY, fetch, maxRetries: 1 });

    await assert.rejects(client.leads.create(LEAD), (error: unknown) => {
      assert.ok(error instanceof ConnectionError);
      assert.ok(!(error instanceof TimeoutError));
      assert.match(error.message, /fetch failed/);
      return true;
    });
    assert.equal(calls.length, 2);
  });

  it('abandons a hung attempt after timeoutMs and throws TimeoutError', async () => {
    const { fetch } = scriptedFetch(hang);
    const client = new AgentFaro({ apiKey: KEY, fetch, timeoutMs: 20, maxRetries: 0 });

    await assert.rejects(client.leads.create(LEAD), TimeoutError);
  });

  it('stops at once when the caller aborts, without retrying', async () => {
    const { fetch, calls } = scriptedFetch(hang);
    const client = new AgentFaro({ apiKey: KEY, fetch, maxRetries: 3 });
    const controller = new AbortController();

    const pending = client.leads.create(LEAD, { signal: controller.signal });
    controller.abort(new Error('user left the page'));

    await assert.rejects(pending, /user left the page/);
    assert.equal(calls.length, 1);
  });
});
