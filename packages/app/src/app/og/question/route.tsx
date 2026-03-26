import { ImageResponse } from 'next/og';
import { parseUnits, zeroAddress } from 'viem';
import { createEscrowAuctionWs } from '@sapience/sdk/relayer/escrowAuctionWs';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { conditionalTokensConditionResolver } from '@sapience/sdk/contracts';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import { OutcomeSide } from '@sapience/sdk/types';
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
import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';

export const runtime = 'nodejs';

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

// Category colors as rgb() for satori compatibility (can't use CSS vars or hsl alpha syntax)
const CATEGORY_COLORS: Record<string, [number, number, number]> = {
  'economy-finance': [53, 151, 118],
  crypto: [150, 95, 227],
  weather: [68, 121, 228],
  geopolitics: [211, 34, 49],
  'tech-science': [210, 166, 45],
  sports: [231, 114, 64],
  culture: [216, 70, 143],
};

function categoryRgb(slug: string): string {
  const c = CATEGORY_COLORS[slug];
  return c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : '';
}

function categoryRgba(slug: string, alpha: number): string {
  const c = CATEGORY_COLORS[slug];
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : '';
}

const CATEGORY_NAMES: Record<string, string> = {
  'economy-finance': 'Economy & Finance',
  crypto: 'Crypto',
  weather: 'Weather',
  geopolitics: 'Geopolitics',
  'tech-science': 'Tech & Science',
  sports: 'Sports',
  culture: 'Culture',
};

// Lucide icon SVG paths for satori (can't use React components)
function CategoryIcon({
  slug,
  color,
  size,
}: {
  slug: string;
  color: string;
  size: number;
}) {
  const svgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (slug) {
    case 'economy-finance': // TrendingUp
      return (
        <svg {...svgProps}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case 'crypto': // Coins
      return (
        <svg {...svgProps}>
          <circle cx="8" cy="8" r="6" />
          <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
          <path d="M7 6h1v4" />
          <path d="m16.71 13.88.7.71-2.82 2.82" />
        </svg>
      );
    case 'weather': // CloudSun
      return (
        <svg {...svgProps}>
          <path d="M12 2v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="M20 12h2" />
          <path d="m19.07 4.93-1.41 1.41" />
          <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
          <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
        </svg>
      );
    case 'geopolitics': // Landmark
      return (
        <svg {...svgProps}>
          <line x1="3" x2="21" y1="22" y2="22" />
          <line x1="6" x2="6" y1="18" y2="11" />
          <line x1="10" x2="10" y1="18" y2="11" />
          <line x1="14" x2="14" y1="18" y2="11" />
          <line x1="18" x2="18" y1="18" y2="11" />
          <polygon points="12 2 20 7 4 7" />
        </svg>
      );
    case 'tech-science': // FlaskConical
      return (
        <svg {...svgProps}>
          <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
          <path d="M8.5 2h7" />
          <path d="M7 16h10" />
        </svg>
      );
    case 'sports': // Medal
      return (
        <svg {...svgProps}>
          <path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
          <path d="M11 12 5.12 2.2" />
          <path d="m13 12 5.88-9.8" />
          <path d="M8 7h8" />
          <circle cx="12" cy="17" r="5" />
          <path d="M12 18v-2h-.5" />
        </svg>
      );
    case 'culture': // Tv
      return (
        <svg {...svgProps}>
          <rect width="20" height="15" x="2" y="7" rx="2" ry="2" />
          <polyline points="17 2 12 7 7 2" />
        </svg>
      );
    default:
      return null;
  }
}

interface ConditionData {
  question: string | null;
  categorySlug: string | null;
}

async function fetchConditionData(
  conditionId: string,
  resolver?: string
): Promise<ConditionData> {
  try {
    const query = `
      query ConditionForOG($where: ConditionWhereInput!) {
        conditions(where: $where, take: 1) {
          question
          category { slug }
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

    if (!response.ok) return { question: null, categorySlug: null };

    const result = await response.json();
    const condition = result?.data?.conditions?.[0];
    return {
      question: condition?.question || null,
      categorySlug: condition?.category?.slug || null,
    };
  } catch {
    return { question: null, categorySlug: null };
  }
}

const RELAYER_WS_URL = 'wss://relayer.sapience.xyz/auction';
const ESTIMATE_TIMEOUT_MS = 5000;

/**
 * Opens a short-lived WS connection to the auction relayer, sends an anonymous
 * escrow auction.start, and waits for a bid from PREFERRED_ESTIMATE_QUOTER.
 * Returns probability (0-1) or null on timeout/error.
 */
async function fetchEstimate(conditionId: string): Promise<number | null> {
  const resolverAddress =
    conditionalTokensConditionResolver[DEFAULT_CHAIN_ID]?.address;
  if (!resolverAddress) return null;

  const formattedConditionId = (
    conditionId.startsWith('0x') ? conditionId : `0x${conditionId}`
  ) as `0x${string}`;

  const picks = canonicalizePicks([
    {
      conditionResolver: resolverAddress,
      conditionId: formattedConditionId,
      predictedOutcome: OutcomeSide.YES,
    },
  ]);

  const predictorCollateral = parseUnits('1', 18).toString();
  const nowSec = Math.floor(Date.now() / 1000);

  let settled = false;
  let resolvePromise: (value: number | null) => void;
  const promise = new Promise<number | null>((resolve) => {
    resolvePromise = resolve;
  });

  const client = await createEscrowAuctionWs(
    RELAYER_WS_URL,
    {
      onOpen: () => {
        client.startAuction({
          picks: picks.map((p) => ({
            conditionResolver: p.conditionResolver,
            conditionId: p.conditionId,
            predictedOutcome: p.predictedOutcome,
          })),
          predictorCollateral,
          predictor: zeroAddress,
          predictorNonce: 0,
          predictorDeadline: nowSec + 300,
          chainId: DEFAULT_CHAIN_ID,
        });
      },
      onAuctionBids: (payload) => {
        if (settled) return;

        const bids = payload?.bids;
        if (!Array.isArray(bids)) return;

        const quoterBid = bids.find(
          (b) =>
            b.counterparty?.toLowerCase() ===
            PREFERRED_ESTIMATE_QUOTER.toLowerCase()
        );
        if (!quoterBid) return;

        settled = true;
        clearTimeout(timeout);
        client.close();

        const predictorColl = BigInt(predictorCollateral);
        const counterpartyColl = BigInt(
          String(
            (quoterBid as Record<string, unknown>).counterpartyCollateral || '0'
          )
        );
        const denom = predictorColl + counterpartyColl;
        if (denom === 0n) {
          resolvePromise(null);
          return;
        }
        const prob = Number(predictorColl) / Number(denom);
        const clamped = Math.max(0, Math.min(1, prob));
        resolvePromise(clamped);
      },
      onError: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        client.close();
        resolvePromise(null);
      },
    },
    { maxRetries: 0 }
  );

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    client.close();
    resolvePromise(null);
  }, ESTIMATE_TIMEOUT_MS);

  return promise;
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

    // Fetch condition data and live estimate in parallel
    const [conditionData, estimate] = await Promise.all([
      fetchConditionData(conditionId, resolver),
      fetchEstimate(conditionId),
    ]);

    const question = conditionData.question || 'Question on Sapience';
    const categorySlug = conditionData.categorySlug;
    const hasCategory = categorySlug ? !!CATEGORY_COLORS[categorySlug] : false;
    const categoryName = categorySlug
      ? CATEGORY_NAMES[categorySlug] || null
      : null;

    // Format probability text: <1%, >99%, or rounded integer
    let probabilityText: string | null = null;
    let probabilityColor: string = og.colors.ethenaBlue;
    if (estimate !== null) {
      const pct = Math.max(0, Math.min(100, estimate * 100));
      if (pct < 1) {
        probabilityText = '<1%';
      } else if (pct > 99) {
        probabilityText = '>99%';
      } else {
        probabilityText = `${Math.round(pct)}%`;
      }
      // Color by probability: red < 15%, green > 85%, blue in between
      if (estimate < 0.15) {
        probabilityColor = 'rgb(231, 76, 60)';
      } else if (estimate > 0.85) {
        probabilityColor = 'rgb(46, 204, 113)';
      }
    }

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

    const imageResponse = new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />

          <div style={contentContainerStyle(scale)}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                justifyContent: 'center',
              }}
            >
              {categoryName && hasCategory && categorySlug ? (
                <div
                  style={{
                    display: 'flex',
                    marginBottom: 16 * scale,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8 * scale,
                      paddingTop: 6 * scale,
                      paddingBottom: 6 * scale,
                      paddingLeft: 14 * scale,
                      paddingRight: 14 * scale,
                      borderRadius: 999,
                      backgroundColor: categoryRgba(categorySlug, 0.2),
                      borderStyle: 'solid',
                      borderWidth: Math.max(1, Math.round(1.5 * scale)),
                      borderColor: categoryRgba(categorySlug, 0.4),
                      fontSize: 18 * scale,
                      lineHeight: `${24 * scale}px`,
                      fontWeight: 600,
                      color: og.colors.brandWhite,
                      fontFamily: FONT_FAMILY.sans,
                    }}
                  >
                    <CategoryIcon
                      slug={categorySlug}
                      color={categoryRgb(categorySlug)}
                      size={Math.round(16 * scale)}
                    />
                    {categoryName}
                  </div>
                </div>
              ) : null}
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
              {probabilityText ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    marginTop: 32 * scale,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 20 * scale,
                      lineHeight: `${26 * scale}px`,
                      fontWeight: 600,
                      color: og.colors.foregroundLight,
                      textTransform: 'uppercase',
                      letterSpacing: 0.06 * scale + 'em',
                      marginBottom: 4 * scale,
                    }}
                  >
                    Current Forecast
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 40 * scale,
                      lineHeight: `${48 * scale}px`,
                      fontWeight: 700,
                      color: probabilityColor,
                      fontFamily: FONT_FAMILY.mono,
                    }}
                  >
                    {probabilityText} Chance
                  </div>
                </div>
              ) : null}
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

    // Cache the rendered image for 15 minutes at the CDN layer, with a
    // 30-minute stale-while-revalidate window. This prevents redundant
    // WebSocket auction calls for the same question within a window.
    imageResponse.headers.set(
      'Cache-Control',
      'public, max-age=900, s-maxage=900, stale-while-revalidate=1800'
    );

    return imageResponse;
  } catch (err) {
    return createErrorImageResponse(err);
  }
}
