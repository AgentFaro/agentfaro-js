# Changelog

## 0.1.0 · 2026-09-27

First release, a preview of the Lead Intake API.

- `leads.create()` sends one lead.
- Leads are checked against the API's field limits before anything is sent.
- Timeouts, dropped connections, `408`, `429` and `5xx` are retried with backoff and `Retry-After`,
  under one idempotency key per call.
- Typed errors for every failure, all extending `AgentFaroError`.
- The client refuses to start in a browser, where the API key would be public.
