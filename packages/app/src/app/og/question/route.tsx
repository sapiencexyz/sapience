import { ImageResponse } from 'next/og';
import {
  og,
  WIDTH,
  HEIGHT,
  getScale,
  loadFontData,
  fontsFromData,
  commonAssets,
  Background,
  baseContainerStyle,
  contentContainerStyle,
  Tagline,
  FONT_FAMILY,
  createErrorImageResponse,
} from '../_shared';

export const runtime = 'edge';

function getGraphQLEndpoint(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/graphql`;
  } catch {
    return 'https://api.sapience.xyz/graphql';
  }
}

async function fetchQuestionTitle(
  conditionId: string,
  resolver?: string
): Promise<string | null> {
  try {
    const query = `
      query ConditionForOG($where: ConditionWhereInput!) {
        conditions(where: $where, take: 1) {
          question
        }
      }
    `;

    const whereClause: { AND: Array<Record<string, unknown>> } = {
      AND: [{ id: { in: [conditionId] } }],
    };
    if (resolver) {
      whereClause.AND.push({
        resolver: { equals: resolver, mode: 'insensitive' },
      });
    }

    const response = await fetch(getGraphQLEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { where: whereClause } }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result?.data?.conditions?.[0]?.question || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.has('debug')) {
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    const conditionId = searchParams.get('conditionId');
    const resolver = searchParams.get('resolver') || undefined;

    if (!conditionId) {
      return createErrorImageResponse(new Error('Missing conditionId'));
    }

    const question =
      (await fetchQuestionTitle(conditionId, resolver)) ||
      'Question on Sapience';

    const { bgUrl } = commonAssets(req);
    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);

    // Step down font size for longer questions
    const fontSize =
      question.length > 120
        ? 36 * scale
        : question.length > 60
          ? 42 * scale
          : 48 * scale;

    return new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />

          <div style={contentContainerStyle(scale)}>
            <div
              style={{
                display: 'flex',
                flex: 1,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'block',
                  fontSize,
                  lineHeight: `${fontSize * 1.3}px`,
                  fontWeight: 600,
                  letterSpacing: -0.16 * scale,
                  color: og.colors.brandWhite,
                  fontFamily: FONT_FAMILY.mono,
                }}
              >
                {question}
              </div>
            </div>

            <Tagline scale={scale} />
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: fontsFromData(fonts),
      }
    );
  } catch (err) {
    return createErrorImageResponse(err);
  }
}
