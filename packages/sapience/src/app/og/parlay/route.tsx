import { ImageResponse } from 'next/og';
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
  FooterLabel,
} from '../_shared';

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.has('debug')) {
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    const wagerRaw = normalizeText(searchParams.get('wager'), 32);
    const payoutRaw = normalizeText(searchParams.get('payout'), 32);
    const wager = addThousandsSeparators(wagerRaw);
    const payout = addThousandsSeparators(payoutRaw);
    const symbol = normalizeText(searchParams.get('symbol'), 16);
    // Anti-parlay flag to change label to "Prediction Against"
    const antiParam = normalizeText(searchParams.get('anti'), 16).toLowerCase();
    const isAntiParlay = ['1', 'true', 'yes', 'anti', 'against'].includes(
      antiParam
    );

    // Validate and normalize Ethereum address (optional)
    const rawAddr = (searchParams.get('addr') || '').toString();
    const cleanedAddr = rawAddr.replace(/\s/g, '').toLowerCase();
    const addr = /^0x[a-f0-9]{40}$/.test(cleanedAddr) ? cleanedAddr : '';

    // Shared assets and fonts
    const { bgUrl } = commonAssets(req);

    // Parse legs passed as repeated `leg` params: text|Yes or text|No
    const rawLegs = searchParams.getAll('leg').slice(0, 12); // safety cap
    const legs = rawLegs
      .map((entry) => entry.split('|'))
      .map(([text, choice]) => ({
        text: normalizeText(text || '', 120),
        choice: (choice || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
      }))
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
                    against={isAntiParlay}
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
                                    marginTop: -5 * scale,
                                  }}
                                >
                                  <FooterLabel scale={scale}>
                                    and more...
                                  </FooterLabel>
                                </div>
                              </div>
                            );
                          }
                          const isYes = leg.choice === 'Yes';
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
                                  color: '#F6F7F9',
                                }}
                              >
                                {leg.text}
                              </div>
                              <Pill
                                text={leg.choice}
                                tone={isYes ? 'success' : 'danger'}
                                scale={scale}
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
            background: '#040613',
            color: '#F6F7F9',
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
