import { ImageResponse } from 'next/og';
import { og } from '../_shared';
import {
  WIDTH,
  HEIGHT,
  getScale,
  normalizeText,
  loadFontData,
  fontsFromData,
  commonAssets,
  Background,
  Footer,
  baseContainerStyle,
  contentContainerStyle,
  addThousandsSeparators,
  Pill,
  PredictionsLabel,
  computePotentialReturn,
} from '../_shared';

export const runtime = 'edge';

// Helper to get GraphQL endpoint URL
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

// Helper to format units (18 decimals for collateral)
function formatUnits(value: string, decimals: number = 18): string {
  try {
    const bigIntValue = BigInt(value);
    const divisor = BigInt(10 ** decimals);
    const whole = bigIntValue / divisor;
    const remainder = bigIntValue % divisor;
    if (remainder === 0n) {
      return whole.toString();
    }
    const remainderStr = remainder.toString().padStart(decimals, '0');
    const trimmed = remainderStr.replace(/0+$/, '');
    return `${whole}.${trimmed}`;
  } catch {
    return '0';
  }
}

// marketAdress, counterparty bool, positionId.
// for a given share card, this will be everything that we need to generate it

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.has('debug')) {
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    // Check if nftId and marketAddress are provided - if so, query API for position data
    const nftIdParam = searchParams.get('nftId');
    const marketAddressParam = searchParams.get('marketAddress');
    let wagerRaw = normalizeText(searchParams.get('wager'), 32);
    let payoutRaw = normalizeText(searchParams.get('payout'), 32);
    let symbol = normalizeText(searchParams.get('symbol'), 16);
    let rawAddr = (searchParams.get('addr') || '').toString();
    let rawLegs: string[] = searchParams.getAll('leg');
    let antiParam = normalizeText(searchParams.get('anti'), 16).toLowerCase();

    // Try NFT ID and market address first (preferred method)
    if (nftIdParam && marketAddressParam) {
      try {
        const graphqlEndpoint = getGraphQLEndpoint();
        const query = `
          query PositionsByNftAndMarket($nftTokenId: String, $marketAddress: String) {
            positions(nftTokenId: $nftTokenId, marketAddress: $marketAddress, take: 1) {
              id
              chainId
              predictor
              counterparty
              predictorNftTokenId
              counterpartyNftTokenId
              predictorCollateral
              counterpartyCollateral
              totalCollateral
              predictions {
                conditionId
                outcomeYes
                condition {
                  id
                  question
                  shortName
                }
              }
            }
          }
        `;

        const response = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            variables: {
              nftTokenId: nftIdParam,
              marketAddress: marketAddressParam,
            },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const positions = result?.data?.positions;
          const position =
            positions && positions.length > 0 ? positions[0] : null;

          if (position) {
            // Extract data from position
            rawAddr = position.predictor?.toLowerCase() || rawAddr;

            // Determine if queried NFT is counterparty's NFT (for anti flag and wager display)
            const isCounterpartyNft =
              position.counterpartyNftTokenId === nftIdParam;
            if (isCounterpartyNft) {
              antiParam = '1';
              // Use counterparty's address for display
              rawAddr = position.counterparty?.toLowerCase() || rawAddr;
            }

            // Get wager and payout
            // If the queried NFT is the counterparty's, show counterparty's wager
            const collateral = isCounterpartyNft
              ? position.counterpartyCollateral
              : position.predictorCollateral;
            const totalCollateral = position.totalCollateral;

            if (collateral) {
              wagerRaw = formatUnits(collateral);
            }
            if (totalCollateral) {
              payoutRaw = formatUnits(totalCollateral);
            }

            // Default symbol if not provided
            if (!symbol) {
              symbol = 'testUSDe';
            }

            // Build legs from predictions
            if (position.predictions && position.predictions.length > 0) {
              rawLegs = position.predictions.map(
                (pred: {
                  condition?: {
                    shortName?: string | null;
                    question?: string | null;
                  } | null;
                  outcomeYes: boolean;
                }) => {
                  const question =
                    pred.condition?.shortName || pred.condition?.question || '';
                  const choice = pred.outcomeYes ? 'Yes' : 'No';
                  return `${question}|${choice}`;
                }
              );
            }
          }
        }
      } catch (err) {
        // If API query fails, fall back to query params
        console.error(
          'Failed to fetch position from API by NFT and market:',
          err
        );
      }
    }

    // Round wager and payout to 2 decimals
    const roundToTwoDecimals = (value: string): string => {
      try {
        const num = parseFloat(value);
        if (isNaN(num)) return value;
        return num.toFixed(2);
      } catch {
        return value;
      }
    };

    const wagerRawRounded = roundToTwoDecimals(wagerRaw);
    const payoutRawRounded = roundToTwoDecimals(payoutRaw);

    const wager = addThousandsSeparators(wagerRawRounded);
    const payout = addThousandsSeparators(payoutRawRounded);
    // Counterparty flag (anti param) to change label to "Prediction Against"
    const isCounterparty = ['1', 'true', 'yes', 'anti', 'against'].includes(
      antiParam
    );

    // Validate and normalize Ethereum address (optional)
    const cleanedAddr = rawAddr.replace(/\s/g, '').toLowerCase();
    const addr = /^0x[a-f0-9]{40}$/.test(cleanedAddr) ? cleanedAddr : '';

    // Shared assets and fonts
    const { bgUrl } = commonAssets(req);

    // Parse legs passed as repeated `leg` params: text|Yes or text|No
    const legs = rawLegs
      .slice(0, 12) // safety cap
      .map((entry) => entry.split('|'))
      .map(([text, choice]) => {
        const label = normalizeText(choice || '', 48) || '—';
        const upper = label.toUpperCase();
        const normalized =
          upper === 'YES' || upper.startsWith('YES')
            ? 'YES'
            : upper === 'NO' || upper.startsWith('NO')
              ? 'NO'
              : upper === 'OVER' || upper.startsWith('OVER')
                ? 'OVER'
                : upper === 'UNDER' || upper.startsWith('UNDER')
                  ? 'UNDER'
                  : null;
        const tone =
          normalized === 'YES' || normalized === 'OVER'
            ? ('success' as const)
            : normalized === 'NO' || normalized === 'UNDER'
              ? ('danger' as const)
              : ('neutral' as const);
        return {
          text: normalizeText(text || '', 120),
          choice: label,
          tone,
        };
      })
      .filter((l) => l.text);

    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);
    // Note: next/og ImageResponse custom headers can cause non-image responses for next/image fetch.
    // Skip attaching headers directly to ImageResponse to ensure proper content-type.

    const potentialReturn = computePotentialReturn(wager, payout);

    return new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />

          <div style={contentContainerStyle(scale)}>
            <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  gap: 28 * scale,
                  alignItems: 'stretch',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16 * scale,
                    flex: 1,
                  }}
                >
                  <PredictionsLabel
                    scale={scale}
                    count={legs.length}
                    against={isCounterparty}
                  />
                  {legs.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12 * scale,
                      }}
                    >
                      {legs
                        .slice(0, Math.min(legs.length, 5))
                        .map((leg, idx) => {
                          const showAndMore = legs.length > 5 && idx === 4;
                          if (showAndMore) {
                            return (
                              <div
                                key="and-more"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 16 * scale,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    fontSize: 20 * scale,
                                    lineHeight: `${24 * scale}px`,
                                    fontWeight: 600,
                                    color: og.colors.mutedWhite64,
                                    fontFamily:
                                      'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                  }}
                                >
                                  and more...
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16 * scale,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  fontSize: 38 * scale,
                                  lineHeight: `${48 * scale}px`,
                                  fontWeight: 700,
                                  letterSpacing: -0.16 * scale,
                                  color: og.colors.brandWhite,
                                  fontFamily:
                                    'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                }}
                              >
                                {leg.text}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Pill
                                  text={leg.choice}
                                  tone={leg.tone}
                                  scale={scale}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Footer
              addr={addr}
              wager={wager}
              payout={payout}
              symbol={symbol}
              potentialReturn={potentialReturn}
              scale={scale}
              showReturn={false}
              forceToWinGreen={true}
            />
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: og.colors.backgroundDark,
            color: og.colors.foregroundLight,
            fontFamily:
              'AvenirNextRounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto',
          }}
        >
          <div style={{ display: 'flex', fontSize: 28, opacity: 0.86 }}>
            Error: {message}
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    );
  }
}
