import { ImageResponse } from 'next/og';
import { isPredictedYes } from '@sapience/sdk/types';
import {
  og,
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
  FONT_FAMILY,
  createErrorImageResponse,
  ResolutionIcon,
  type ResolutionStatus,
} from '../_shared';
import {
  PREDICTION_BY_ID_QUERY,
  CONDITIONS_BY_IDS_QUERY,
  getGraphQLEndpoint,
  formatUnits,
  normalizeChoiceLabel,
  getChoiceTone,
  roundToTwoDecimals,
  type PredictionData,
  type ConditionData,
} from '../_prediction-helpers';
import { getChoiceLabel } from '~/lib/resolvers/choiceLabel';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Read query params
    const predictionId = searchParams.get('predictionId');
    let positionSizeRaw = normalizeText(searchParams.get('wager'), 32);
    let payoutRaw = normalizeText(searchParams.get('payout'), 32);
    let symbol = normalizeText(searchParams.get('symbol'), 16);
    let rawLegs: string[] = searchParams.getAll('leg');
    const antiParam = normalizeText(searchParams.get('anti'), 16).toLowerCase();

    const hasLegs = rawLegs.length > 0;

    // If predictionId is provided and we need data from it (no legs, or need to fill in missing data)
    if (predictionId) {
      try {
        const graphqlEndpoint = getGraphQLEndpoint();
        let prediction: PredictionData | null = null;

        const response = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: PREDICTION_BY_ID_QUERY,
            variables: { id: predictionId },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          prediction = result?.data?.prediction ?? null;
        }

        if (prediction) {
          // Build legs from picks if not provided via query params
          if (!hasLegs) {
            const picks = prediction.pickConfig?.picks ?? [];
            const conditionIds = picks.map((p) => p.conditionId);

            // Fetch condition question text
            const conditionsMap = new Map<string, ConditionData>();
            if (conditionIds.length > 0) {
              try {
                const condResp = await fetch(graphqlEndpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    query: CONDITIONS_BY_IDS_QUERY,
                    variables: { where: { id: { in: conditionIds } } },
                  }),
                });
                if (condResp.ok) {
                  const condResult = await condResp.json();
                  const conditions: ConditionData[] =
                    condResult?.data?.conditions ?? [];
                  for (const c of conditions) {
                    conditionsMap.set(c.id, c);
                  }
                }
              } catch (err) {
                console.error('Failed to fetch conditions:', err);
              }
            }

            rawLegs = picks.map((pick) => {
              const condition = conditionsMap.get(pick.conditionId);
              const question =
                condition?.question || condition?.shortName || pick.conditionId;
              const choice = getChoiceLabel(pick.predictedOutcome);

              // Determine resolution status per leg
              let resolution: ResolutionStatus | null = null;
              if (condition?.settled) {
                const predictedYes = isPredictedYes(pick.predictedOutcome);
                const resolvedToYes = condition.resolvedToYes ?? false;
                const correct = predictedYes === resolvedToYes;
                resolution = correct ? 'correct' : 'incorrect';
              } else if (condition?.settled === false) {
                resolution = 'pending';
              }

              return `${question}|${choice}|${resolution ?? ''}`;
            });
          }

          // Use API data for wager/payout only if not provided via query params
          if (!positionSizeRaw) {
            positionSizeRaw = formatUnits(prediction.predictorCollateral);
          }
          if (!payoutRaw) {
            const totalCollateral =
              BigInt(prediction.predictorCollateral) +
              BigInt(prediction.counterpartyCollateral);
            payoutRaw = formatUnits(totalCollateral.toString());
          }

          // Default symbol if not provided
          if (!symbol) {
            symbol = 'USDe';
          }
        } else if (!hasLegs) {
          // No prediction found and no legs provided — nothing to render
          return createErrorImageResponse(new Error('Prediction not found'));
        }
      } catch (err) {
        console.error('Failed to fetch prediction:', err);
        // If API fails but we have legs from query params, continue rendering
        if (!hasLegs) {
          return createErrorImageResponse(err);
        }
      }
    }

    // Default symbol
    if (!symbol) {
      symbol = 'USDe';
    }

    // Round position size and payout to 2 decimals
    const positionSizeRawRounded = roundToTwoDecimals(positionSizeRaw);
    const payoutRawRounded = roundToTwoDecimals(payoutRaw);

    const positionSize = addThousandsSeparators(positionSizeRawRounded);
    const payout = addThousandsSeparators(payoutRawRounded);

    // Counterparty flag (anti param) to change label to "Prediction Against"
    const isCounterparty = ['1', 'true', 'yes', 'anti', 'against'].includes(
      antiParam
    );

    // Compute implied probability (matches formatPercentChance from lib/format)
    let implied: string | null = null;
    const positionSizeNum = Number(positionSizeRawRounded.replace(/,/g, ''));
    const payoutNum = Number(payoutRawRounded.replace(/,/g, ''));
    if (positionSizeNum > 0 && payoutNum > 0) {
      const raw = positionSizeNum / payoutNum;
      const pct = Math.max(
        0,
        Math.min(100, (isCounterparty ? 1 - raw : raw) * 100)
      );
      if (pct < 1) implied = '<1%';
      else if (pct > 99) implied = '>99%';
      else implied = `${Math.round(pct)}%`;
    }

    // Shared assets and fonts
    const { bgUrl } = commonAssets(req);

    // Parse legs passed as repeated `leg` params: text|Yes or text|No or text|Yes|resolution
    const legs = rawLegs
      .slice(0, 12) // safety cap
      .map((entry) => entry.split('|'))
      .map(([text, choice, resolutionStr]) => {
        const label = normalizeText(choice || '', 48);
        const normalized = label ? normalizeChoiceLabel(label) : null;
        const resolution: ResolutionStatus | null =
          resolutionStr === 'correct' ||
          resolutionStr === 'incorrect' ||
          resolutionStr === 'pending'
            ? resolutionStr
            : null;
        return {
          text: normalizeText(text || '', 120),
          choice: label,
          tone: getChoiceTone(normalized),
          resolution,
        };
      })
      .filter((l) => l.text);

    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);

    const compact = legs.length > 3;
    const potentialReturn = computePotentialReturn(positionSize, payout);

    const imageResponse = new ImageResponse(
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
                    gap: 12 * scale,
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
                        const words = leg.text.split(' ');
                        const lineH = (compact ? 30 : 40) * scale;
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                            }}
                          >
                            {leg.resolution && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  height: lineH,
                                  marginBottom: (compact ? 4 : 6) * scale,
                                  marginTop: 2 * scale,
                                }}
                              >
                                <ResolutionIcon
                                  status={leg.resolution}
                                  scale={scale}
                                  compact={compact}
                                />
                              </div>
                            )}
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                flex: 1,
                                minWidth: 0,
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
                              {leg.choice && (
                                <Pill
                                  text={leg.choice}
                                  tone={leg.tone}
                                  scale={scale}
                                  compact={compact}
                                />
                              )}
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

    imageResponse.headers.set(
      'Cache-Control',
      'public, max-age=300, s-maxage=300, stale-while-revalidate=600'
    );

    return imageResponse;
  } catch (err) {
    return createErrorImageResponse(err);
  }
}
