import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadUsagePayload } from './data';
import type { UsagePayload } from './types';

const makePayload = (sourceNote: string): UsagePayload => ({
  generatedAt: '2026-05-28T08:00:00.000Z',
  pricing: { lastVerified: '2026-05-27', links: [], sourceNote },
  sessions: [],
  sources: [],
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status: 200,
  });

const htmlResponse = (): Response =>
  new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
    headers: { 'content-type': 'text/html' },
    status: 200,
  });

const notFound = (): Response => new Response('Not found', { status: 404 });

// Routes each requested path to a canned response; unknown paths are 404.
const stubFetch = (routes: Record<string, () => Response>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = typeof input === 'string' ? input : input.toString();
    return (routes[path] ?? notFound)();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('loadUsagePayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to sample-usage.json when usage.json is missing (404)', async () => {
    stubFetch({ '/data/sample-usage.json': () => jsonResponse(makePayload('sample')) });

    const payload = await loadUsagePayload();

    expect(payload.pricing.sourceNote).toBe('sample');
  });

  it('falls back to sample-usage.json when usage.json is served as HTML with 200', async () => {
    const fetchMock = stubFetch({
      '/data/sample-usage.json': () => jsonResponse(makePayload('sample')),
      '/data/usage.json': htmlResponse,
    });

    const payload = await loadUsagePayload();

    expect(payload.pricing.sourceNote).toBe('sample');
    expect(fetchMock).toHaveBeenCalledWith('/data/sample-usage.json', expect.anything());
  });

  it('returns usage.json when it is valid JSON', async () => {
    const fetchMock = stubFetch({
      '/data/sample-usage.json': () => jsonResponse(makePayload('sample')),
      '/data/usage.json': () => jsonResponse(makePayload('local')),
    });

    const payload = await loadUsagePayload();

    expect(payload.pricing.sourceNote).toBe('local');
    expect(fetchMock).not.toHaveBeenCalledWith('/data/sample-usage.json', expect.anything());
  });

  it('uses the built-in fallback when both files are served as HTML', async () => {
    stubFetch({ '/data/sample-usage.json': htmlResponse, '/data/usage.json': htmlResponse });

    const payload = await loadUsagePayload();

    expect(payload.sessions.length).toBeGreaterThan(0);
  });
});
