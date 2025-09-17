export const runtime = 'edge';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const isDev = process.env.NODE_ENV !== 'production';
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const PROD_ORIGINS = ['https://sapience.xyz', 'https://www.sapience.xyz'];
const ALLOWED_ORIGINS = isDev ? DEV_ORIGINS : PROD_ORIGINS;

function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function getAllowedOriginFromRequest(req: Request): string | null {
  const originHeader = parseOrigin(req.headers.get('origin'));
  if (isAllowedOrigin(originHeader)) return originHeader as string;

  const refererOrigin = parseOrigin(req.headers.get('referer'));
  if (isAllowedOrigin(refererOrigin)) return refererOrigin as string;

  return null;
}

function corsHeadersForRequest(req: Request) {
  const allowedOrigin = getAllowedOriginFromRequest(req);
  const base = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } as const;
  return allowedOrigin
    ? ({ ...base, 'Access-Control-Allow-Origin': allowedOrigin } as const)
    : base;
}

export function OPTIONS(req: Request) {
  const origin = getAllowedOriginFromRequest(req);
  if (!origin) {
    return new Response(null, {
      status: 403,
      headers: corsHeadersForRequest(req),
    });
  }
  return new Response(null, { headers: corsHeadersForRequest(req) });
}

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages: OpenRouterMessage[];
      model?: string;
      apiKey?: string;
      headers?: { referer?: string; title?: string };
      stream?: boolean;
      temperature?: number;
    };

    const allowedOrigin = getAllowedOriginFromRequest(req);
    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: {
          ...corsHeadersForRequest(req),
          'Content-Type': 'application/json',
        },
      });
    }

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages required' }),
        {
          status: 400,
          headers: {
            ...corsHeadersForRequest(req),
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const apiKey = body.apiKey || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 401,
        headers: {
          ...corsHeadersForRequest(req),
          'Content-Type': 'application/json',
        },
      });
    }

    const payload = {
      model: body.model || 'openai/gpt-4o',
      messages: body.messages,
      stream: Boolean(body.stream) && false, // disable streaming in v1
      temperature:
        typeof body.temperature === 'number' ? body.temperature : undefined,
    };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    // Set required OpenRouter allowlist headers server-side
    headers['HTTP-Referer'] = allowedOrigin;
    headers['X-Title'] = 'Sapience';

    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    const status = upstream.status;

    return new Response(text, {
      status,
      headers: {
        ...corsHeadersForRequest(req),
        'Content-Type': 'application/json',
      },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: {
        ...corsHeadersForRequest(req),
        'Content-Type': 'application/json',
      },
    });
  }
}
