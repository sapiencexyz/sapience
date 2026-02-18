export const runtime = 'edge';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// --- Request Limits ---
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 100_000; // 100KB per message
const MAX_TOTAL_CONTENT_LENGTH = 500_000; // 500KB total
const VALID_ROLES = new Set(['system', 'user', 'assistant']);

// --- CORS Configuration ---
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
  // Prefer Origin header (set automatically by browsers on CORS requests)
  const originHeader = parseOrigin(req.headers.get('origin'));
  if (isAllowedOrigin(originHeader)) return originHeader as string;

  // Fallback to Referer for same-origin requests where Origin may be absent
  // Note: Referer can be spoofed by non-browser clients, but CORS protection
  // is primarily about browser security. Non-browser clients can call
  // OpenRouter directly anyway if they have an API key.
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

function errorResponse(
  req: Request,
  message: string,
  status: number
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      'Content-Type': 'application/json',
    },
  });
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

type RequestBody = {
  messages: OpenRouterMessage[];
  model?: string;
  apiKey?: string;
  headers?: { referer?: string; title?: string };
  stream?: boolean;
  temperature?: number;
};

/**
 * Validates message structure and content limits.
 * Returns an error string if invalid, null if valid.
 */
function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'messages must be an array';
  }

  if (messages.length === 0) {
    return 'messages array cannot be empty';
  }

  if (messages.length > MAX_MESSAGES) {
    return `too many messages (max ${MAX_MESSAGES})`;
  }

  let totalLength = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg || typeof msg !== 'object') {
      return `message ${i} is not an object`;
    }

    const { role, content } = msg as Record<string, unknown>;

    if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
      return `message ${i} has invalid role (must be system, user, or assistant)`;
    }

    if (typeof content !== 'string') {
      return `message ${i} content must be a string`;
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return `message ${i} exceeds max length (${MAX_MESSAGE_LENGTH} chars)`;
    }

    totalLength += content.length;
  }

  if (totalLength > MAX_TOTAL_CONTENT_LENGTH) {
    return `total content exceeds max length (${MAX_TOTAL_CONTENT_LENGTH} chars)`;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    // Check origin before parsing body to fail fast
    const allowedOrigin = getAllowedOriginFromRequest(req);
    if (!allowedOrigin) {
      return errorResponse(req, 'Origin not allowed', 403);
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return errorResponse(req, 'Invalid JSON body', 400);
    }

    // Validate messages structure and limits
    const messageError = validateMessages(body.messages);
    if (messageError) {
      return errorResponse(req, messageError, 400);
    }

    // Validate API key presence
    const apiKey = body.apiKey || '';
    if (!apiKey) {
      return errorResponse(req, 'Missing API key', 401);
    }

    const payload = {
      model: body.model || 'openai/gpt-4o',
      messages: body.messages,
      stream: false, // streaming disabled in v1
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
  } catch {
    return errorResponse(req, 'Internal error', 500);
  }
}
