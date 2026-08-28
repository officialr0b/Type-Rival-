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
  const headers = new Headers({ apikey: key, 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('supabase_api_unavailable', error);
    return Response.json({ error: 'TypeRival services are temporarily unavailable.' }, { status: 503 });
  }
}
