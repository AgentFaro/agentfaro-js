export interface Call {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
  body: unknown;
}

/** A canned answer, rebuilt as a fresh Response for every call that replays it. */
export interface Canned {
  status: number;
  body: string;
  headers: Record<string, string>;
}

type Step = Canned | Error | ((init: RequestInit) => Promise<Response>);

/** A fetch that replays `steps` in order and records every call it receives. */
export function scriptedFetch(...steps: Step[]) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(input),
      init,
      headers: Object.fromEntries(Object.entries(init.headers ?? {})),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === undefined) throw new Error('scriptedFetch: no steps');
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(init);
    return new Response(step.body, { status: step.status, headers: step.headers });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Canned {
  return { status, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } };
}

/** A fetch step that never answers until its signal aborts, like a hung connection. */
export function hang(init: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
}

export const LEAD = {
  name: 'Jordan Rivera',
  email: 'Jordan@Example.com',
  phone: '(312) 555-0142',
  message: 'Looking at two-bedroom condos near the lake this spring.',
  sourceUrl: 'https://www.example.com/contact/',
};

export const ACCEPTED = { id: '0b8f3c1e-3f5a-4a55-9f39-2d1d7e0c9a41', status: 'accepted' };
