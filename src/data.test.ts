import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSamplePayload, loadUsagePayload, shiftSampleDates } from './data';
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

describe('payload origin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks usage.json as local', async () => {
    stubFetch({ '/data/usage.json': () => jsonResponse(makePayload('local')) });

    expect(isSamplePayload(await loadUsagePayload())).toBe(false);
  });

  it('marks sample-usage.json as sample', async () => {
    stubFetch({ '/data/sample-usage.json': () => jsonResponse(makePayload('sample')) });

    expect(isSamplePayload(await loadUsagePayload())).toBe(true);
  });

  it('marks the built-in fallback as sample', async () => {
    stubFetch({});

    expect(isSamplePayload(await loadUsagePayload())).toBe(true);
  });
});

const session = (date: string): UsagePayload['sessions'][number] => ({
  cacheCreationInputTokens: 0,
  cachedInputTokens: 0,
  costUsd: 0,
  date,
  inputTokens: 0,
  interactions: 1,
  model: 'example-model',
  outputTokens: 0,
  provider: 'Claude',
  totalTokens: 0,
  workspace: 'example/app',
});

describe('shiftSampleDates', () => {
  const today = new Date(2026, 10, 11); // 2026-11-11, local time

  it('moves the latest date to today and keeps relative spacing', () => {
    const payload = {
      ...makePayload('sample'),
      sessions: [session('2026-05-21'), session('2026-05-25'), session('2026-05-24')],
    };

    const shifted = shiftSampleDates(payload, today);

    expect(shifted.sessions.map((s) => s.date)).toEqual(['2026-11-07', '2026-11-11', '2026-11-10']);
    // Sample generatedAt is 3 days after its last session; it is capped at now.
    expect(Date.parse(shifted.generatedAt)).toBeLessThanOrEqual(today.getTime());
  });

  it('does not mutate the input payload', () => {
    const payload = { ...makePayload('sample'), sessions: [session('2026-05-25')] };

    shiftSampleDates(payload, today);

    expect(payload.sessions[0].date).toBe('2026-05-25');
  });

  it('returns empty payloads unchanged', () => {
    const payload = makePayload('sample');

    expect(shiftSampleDates(payload, today)).toBe(payload);
  });
});

describe('loadUsagePayload date handling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shifts sample data to today but leaves local data as-is', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 11, 12) });
    const withSessions = (note: string) => ({ ...makePayload(note), sessions: [session('2026-05-25')] });

    stubFetch({ '/data/sample-usage.json': () => jsonResponse(withSessions('sample')) });
    expect((await loadUsagePayload()).sessions[0].date).toBe('2026-11-11');

    stubFetch({ '/data/usage.json': () => jsonResponse(withSessions('local')) });
    expect((await loadUsagePayload()).sessions[0].date).toBe('2026-05-25');
  });
});
