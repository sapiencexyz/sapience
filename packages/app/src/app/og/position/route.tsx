import { ImageResponse } from 'next/og';
import {
  og,
  WIDTH,
  HEIGHT,
  getScale,
  normalizeText,
  parseEthereumAddress,
  loadFontData,
  fontsFromData,
  commonAssets,
  Background,
  Footer,
  TopLeftAvatar,
  baseContainerStyle,
  contentContainerStyle,
  addThousandsSeparators,
  Pill,
  PredictionsLabel,
  computePotentialReturn,
  FONT_FAMILY,
  createErrorImageResponse,
} from '../_shared';
import {
  POSITION_BY_NFT_QUERY,
  getGraphQLEndpoint,
  formatUnits,
  normalizeChoiceLabel,
  getChoiceTone,
  roundToTwoDecimals,
  type PositionPrediction,
} from '../_position-helpers';

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Check if nftId and marketAddress are provided - if so, query API for position data
    const nftIdParam = searchParams.get('nftId');
    const marketAddressParam = searchParams.get('marketAddress');
    let positionSizeRaw = normalizeText(searchParams.get('wager'), 32);
    let payoutRaw = normalizeText(searchParams.get('payout'), 32);
    let symbol = normalizeText(searchParams.get('symbol'), 16);
    let rawAddr = (searchParams.get('addr') || '').toString();
    let rawLegs: string[] = searchParams.getAll('leg');
    let antiParam = normalizeText(searchParams.get('anti'), 16).toLowerCase();

    // Try NFT ID and market address first (preferred method)
    if (nftIdParam && marketAddressParam) {
      try {
        const graphqlEndpoint = getGraphQLEndpoint();

        const response = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: POSITION_BY_NFT_QUERY,
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

            // Determine if queried NFT is counterparty's NFT (for anti flag and position size display)
            const isCounterpartyNft =
              position.counterpartyNftTokenId === nftIdParam;
            if (isCounterpartyNft) {
              antiParam = '1';
              // Use counterparty's address for display
              rawAddr = position.counterparty?.toLowerCase() || rawAddr;
            }

            // Get position size and payout
            // If the queried NFT is the counterparty's, show counterparty's position size
            const collateral = isCounterpartyNft
              ? position.counterpartyCollateral
              : position.predictorCollateral;
            const totalCollateral = position.totalCollateral;

            if (collateral) {
              positionSizeRaw = formatUnits(collateral);
            }
            if (totalCollateral) {
              payoutRaw = formatUnits(totalCollateral);
            }

            // Default symbol if not provided
            if (!symbol) {
              symbol = 'USDe';
            }

            // Build legs from predictions
            // OG images use shortName when available for more compact display
            if (position.predictions && position.predictions.length > 0) {
              rawLegs = position.predictions.map((pred: PositionPrediction) => {
                const question =
                  pred.condition?.shortName || pred.condition?.question || '';
                const choice = pred.outcomeYes ? 'Yes' : 'No';
                return `${question}|${choice}`;
              });
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

    // Round position size and payout to 2 decimals
    const positionSizeRawRounded = roundToTwoDecimals(positionSizeRaw);
    const payoutRawRounded = roundToTwoDecimals(payoutRaw);

    const positionSize = addThousandsSeparators(positionSizeRawRounded);
    const payout = addThousandsSeparators(payoutRawRounded);

    // Compute implied probability (matches formatPercentChance from lib/format)
    let implied: string | null = null;
    const positionSizeNum = Number(positionSizeRawRounded.replace(/,/g, ''));
    const payoutNum = Number(payoutRawRounded.replace(/,/g, ''));
    if (positionSizeNum > 0 && payoutNum > 0) {
      const raw = positionSizeNum / payoutNum;
      const isAnti = ['1', 'true', 'yes', 'anti', 'against'].includes(
        antiParam
      );
      const pct = Math.max(0, Math.min(100, (isAnti ? 1 - raw : raw) * 100));
      if (pct < 1) implied = '<1%';
      else if (pct > 99) implied = '>99%';
      else implied = `${Math.round(pct)}%`;
    }

    // Counterparty flag (anti param) to change label to "Prediction Against"
    const isCounterparty = ['1', 'true', 'yes', 'anti', 'against'].includes(
      antiParam
    );

    // Validate and normalize Ethereum address (optional)
    const addr = parseEthereumAddress(rawAddr);

    // Shared assets and fonts
    const { bgUrl } = commonAssets(req);

    // Parse legs passed as repeated `leg` params: text|Yes or text|No
    const legs = rawLegs
      .slice(0, 12) // safety cap
      .map((entry) => entry.split('|'))
      .map(([text, choice]) => {
        const label = normalizeText(choice || '', 48) || '—';
        const normalized = normalizeChoiceLabel(label);
        return {
          text: normalizeText(text || '', 120),
          choice: label,
          tone: getChoiceTone(normalized),
        };
      })
      .filter((l) => l.text);

    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);
    // Note: next/og ImageResponse custom headers can cause non-image responses for next/image fetch.
    // Skip attaching headers directly to ImageResponse to ensure proper content-type.

    const compact = legs.length > 3;
    const potentialReturn = computePotentialReturn(positionSize, payout);

    return new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />
          <TopLeftAvatar addr={addr} scale={scale} />

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
                    gap: 6 * scale,
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
                        gap: (compact ? 8 : 12) * scale,
                      }}
                    >
                      {legs.map((leg, idx) => {
                        // Split text into words so badge flows inline
                        const words = leg.text.split(' ');
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                            }}
                          >
                            {words.map((word, wordIdx) => (
                              <div
                                key={wordIdx}
                                style={{
                                  display: 'flex',
                                  fontSize: (compact ? 24 : 32) * scale,
                                  lineHeight: `${(compact ? 30 : 40) * scale}px`,
                                  fontWeight: 550,
                                  letterSpacing: -0.16 * scale,
                                  color: og.colors.brandWhite,
                                  fontFamily: FONT_FAMILY.mono,
                                  marginRight: (compact ? 8 : 12) * scale,
                                  marginBottom: (compact ? 4 : 6) * scale,
                                }}
                              >
                                {word}
                              </div>
                            ))}
                            <Pill
                              text={leg.choice}
                              tone={leg.tone}
                              scale={scale}
                              compact={compact}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Footer
              positionSize={positionSize}
              payout={payout}
              symbol={symbol}
              potentialReturn={potentialReturn}
              implied={implied}
              scale={scale}
              showReturn={false}
              forcePayoutGreen={true}
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
    return createErrorImageResponse(err);
  }
}
