import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';

import AgentFaroDefault, { AgentFaro, AgentFaroError, VERSION } from '../src/index.ts';
import { ACCEPTED, LEAD, json, scriptedFetch } from './helpers.ts';

describe('AgentFaro client', () => {
  const saved = process.env.AGENTFARO_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.AGENTFARO_API_KEY;
    else process.env.AGENTFARO_API_KEY = saved;
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it('refuses to start without a key', () => {
    delete process.env.AGENTFARO_API_KEY;
    assert.throws(() => new AgentFaro(), AgentFaroError);
  });

  it('reads the key from AGENTFARO_API_KEY', async () => {
    process.env.AGENTFARO_API_KEY = 'af_test_from_env';
    const { fetch, calls } = scriptedFetch(json(202, ACCEPTED));

    await new AgentFaro({ fetch }).leads.create(LEAD);

    assert.equal(calls[0]?.headers.Authorization, 'Bearer af_test_from_env');
  });

  it('refuses to run in a browser unless told to', () => {
    Object.assign(globalThis, { window: {}, document: {} });
    assert.throws(() => new AgentFaro({ apiKey: 'af_test_x' }), /not in the browser/);
    assert.doesNotThrow(() => new AgentFaro({ apiKey: 'af_test_x', dangerouslyAllowBrowser: true }));
  });

  it('never exposes the key when serialized', () => {
    const client = new AgentFaro({ apiKey: 'af_test_secret_value' });
    assert.doesNotMatch(JSON.stringify(client), /af_test_secret_value/);
  });

  it('rejects a negative retry count', () => {
    assert.throws(() => new AgentFaro({ apiKey: 'af_test_x', maxRetries: -1 }), /maxRetries/);
  });

  it('is also the default export', () => {
    assert.equal(AgentFaroDefault, AgentFaro);
  });

  it('reports the same version as package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(VERSION, pkg.version);
  });
});
