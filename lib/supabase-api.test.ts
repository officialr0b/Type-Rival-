import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { NextRequest } from 'next/server';
import { canRetryTypeRivalRequest, proxyTypeRivalApi } from './supabase-api.ts';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function request(method: string, body = '') {
  return {
    method,
    headers: new Headers(body ? { 'content-length': String(body.length) } : undefined),
    nextUrl: new URL('https://typerival.com/api/test'),
    text: async () => body,
  } as unknown as NextRequest;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

describe('TypeRival API proxy retries', () => {
  it('only retries read requests and the idempotent session submission', () => {
    assert.equal(canRetryTypeRivalRequest('GET', 'bootstrap'), true);
    assert.equal(canRetryTypeRivalRequest('POST', '/sessions'), true);
    assert.equal(canRetryTypeRivalRequest('POST', 'feedback'), false);
    assert.equal(canRetryTypeRivalRequest('PATCH', 'runs/ticket'), false);
  });

  it('retries a transient session failure and returns the successful response', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ error: 'temporary' }, { status: 503 })
        : Response.json({ saved: true }, { status: 200, headers: { 'x-request-id': 'retry-success' } });
    };

    const response = await proxyTypeRivalApi(request('POST', '{"runTicketId":"ticket"}'), 'sessions');

    assert.equal(calls, 2);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'retry-success');
    assert.deepEqual(await response.json(), { saved: true });
  });

  it('does not retry a non-idempotent feedback submission', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({ error: 'temporary' }, {
        status: 503,
        headers: {
          'x-request-id': 'feedback-failure',
          'x-typerival-error-stage': 'feedback:insert',
          'x-typerival-error-code': '08006',
        },
      });
    };

    const response = await proxyTypeRivalApi(request('POST', '{"message":"hello world"}'), 'feedback');

    assert.equal(calls, 1);
    assert.equal(response.status, 503);
  });
});
