import type { NextRequest } from 'next/server';

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

export function canRetryTypeRivalRequest(method: string, path: string) {
  return method === 'GET' || (method === 'POST' && path.replace(/^\/+/, '') === 'sessions');
}

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  const candidate = (error as { code?: unknown; name?: unknown }).code
    ?? (error as { name?: unknown }).name;
  if (typeof candidate !== 'string' || !candidate.trim()) return 'UNKNOWN';
  return candidate.trim().slice(0, 80).replace(/[^A-Za-z0-9_.:-]/g, '_');
}

export async function proxyTypeRivalApi(request: NextRequest, path: string) {
  const startedAt = Date.now();
  let attemptCount = 0;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return Response.json({ error: 'TypeRival account services are not configured.' }, { status: 503 });
  }

  const upstream = new URL(`${url.replace(/\/$/, '')}/functions/v1/typerival-api/${path.replace(/^\//, '')}`);
  for (const [name, value] of request.nextUrl.searchParams) upstream.searchParams.append(name, value);
  const authorization = request.headers.get('authorization');
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 100_000) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 });
  }
  const headers = new Headers({ apikey: key, 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip');
  if (clientIp) headers.set('x-typerival-client-ip', clientIp);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  try {
    const maxAttempts = canRetryTypeRivalRequest(request.method, path) ? 2 : 1;
    let response: Response | null = null;
    let firstFailure: number | string | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      attemptCount = attempt + 1;
      try {
        const candidate = await fetch(upstream, {
          method: request.method,
          headers,
          body,
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        });
        if (RETRYABLE_STATUS.has(candidate.status) && attempt + 1 < maxAttempts) {
          firstFailure = candidate.status;
          await candidate.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        response = candidate;
        break;
      } catch (error) {
        lastError = error;
        firstFailure ??= safeErrorCode(error);
        if (attempt + 1 >= maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (!response) throw lastError ?? new Error('Supabase returned no response.');
    const requestId = response.headers.get('x-request-id') ?? crypto.randomUUID();
    if (firstFailure && response.ok) {
      console.warn(JSON.stringify({
        event: 'supabase_api_transient_recovered',
        path,
        method: request.method,
        firstFailure,
        attemptCount,
        durationMs: Date.now() - startedAt,
        requestId,
      }));
    }
    if (!response.ok) {
      const details = {
        event: response.status >= 500 ? 'supabase_api_upstream_error' : 'supabase_api_client_rejected',
        path,
        method: request.method,
        status: response.status,
        attemptCount,
        durationMs: Date.now() - startedAt,
        requestId,
        upstreamStage: response.headers.get('x-typerival-error-stage') ?? 'unknown',
        upstreamCode: response.headers.get('x-typerival-error-code') ?? 'unknown',
      };
      if (response.status >= 500) console.error(JSON.stringify(details));
      else console.warn(JSON.stringify(details));
    }
    const responseHeaders = new Headers({
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    });
    const disposition = response.headers.get('content-disposition');
    if (disposition) responseHeaders.set('content-disposition', disposition);
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'supabase_api_unavailable',
      path,
      method: request.method,
      attemptCount,
      durationMs: Date.now() - startedAt,
      errorCode: safeErrorCode(error),
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json({ error: 'TypeRival services are temporarily unavailable.' }, { status: 503 });
  }
}
