import type { NextRequest } from 'next/server';

export async function proxyTypeRivalApi(request: NextRequest, path: string) {
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
    const maxAttempts = request.method === 'GET' ? 2 : 1;
    let response: Response | null = null;
    let firstFailureStatus: number | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const candidate = await fetch(upstream, {
          method: request.method,
          headers,
          body,
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        });
        if (candidate.status >= 500 && attempt + 1 < maxAttempts) {
          firstFailureStatus = candidate.status;
          await candidate.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        response = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (attempt + 1 >= maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (!response) throw lastError ?? new Error('Supabase returned no response.');
    const requestId = response.headers.get('x-request-id') ?? crypto.randomUUID();
    if (firstFailureStatus && response.ok) {
      console.warn('supabase_api_transient_recovered', {
        path,
        method: request.method,
        firstStatus: firstFailureStatus,
        requestId,
      });
    }
    if (!response.ok) {
      const details = {
        path,
        method: request.method,
        status: response.status,
        requestId,
        upstreamStage: response.headers.get('x-typerival-error-stage') ?? 'unknown',
      };
      if (response.status >= 500) console.error('supabase_api_upstream_error', details);
      else console.warn('supabase_api_client_rejected', details);
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
    console.error('supabase_api_unavailable', error);
    return Response.json({ error: 'TypeRival services are temporarily unavailable.' }, { status: 503 });
  }
}
