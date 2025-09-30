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
  baseContainerStyle,
  contentContainerStyle,
  PredictionsLabel,
  Pill,
  Footer,
  addThousandsSeparators,
  computePotentialReturn,
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

    const question =
      normalizeText(searchParams.get('q'), 160) || 'Trade on Sapience';
    const wagerRaw = normalizeText(searchParams.get('wager'), 32);
    const payoutRaw = normalizeText(searchParams.get('payout'), 32);
    const wager = addThousandsSeparators(wagerRaw);
    const payout = addThousandsSeparators(payoutRaw);
    const symbol = normalizeText(searchParams.get('symbol'), 16);
    const dir = normalizeText(searchParams.get('dir'), 16);

    // Validate and normalize Ethereum address
    const rawAddr = (searchParams.get('addr') || '').toString();
    const cleanedAddr = rawAddr.replace(/\s/g, '').toLowerCase();
    const addr = /^0x[a-f0-9]{40}$/.test(cleanedAddr) ? cleanedAddr : '';

    const lowerDir = (dir || '').toLowerCase();
    const yesNoLabel = lowerDir.includes('on yes')
      ? 'Yes'
      : lowerDir.includes('on no')
        ? 'No'
        : '';
    const longShortLabel =
      lowerDir === 'long' ? 'Long' : lowerDir === 'short' ? 'Short' : '';

    // Closed trades (shared from the closed positions table) include explicit entry/exit params
    // Use that as a signal to suppress the Yes/No pill on share cards (keep Long/Short for linear)
    const isClosedShareCard = Boolean(
      (searchParams.get('exit') || '').length ||
        (searchParams.get('entry') || '').length ||
        ['1', 'true', 'yes', 'closed'].includes(
          (searchParams.get('closed') || '').toLowerCase()
        )
    );
    const shouldShowPill =
      (yesNoLabel || longShortLabel) && !(isClosedShareCard && !!yesNoLabel);

    const { bgUrl } = commonAssets(req);
    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);
    // Note: next/og ImageResponse does not support custom headers reliably across runtimes.
    // We omit explicit cache headers here to avoid invalid responses for next/image.

    const potentialReturn = computePotentialReturn(wager, payout);

    // Always render blockie based on full address in shared component; no ENS avatar

    return new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />

          <div style={contentContainerStyle(scale)}>
            <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16 * scale,
                }}
              >
                <PredictionsLabel scale={scale} count={1} />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 12 * scale,
                  }}
                >
                  <div
                    style={{
                      display: 'block',
                      fontSize: 38 * scale,
                      lineHeight: `${48 * scale}px`,
                      fontWeight: 700,
                      letterSpacing: -0.16 * scale,
                      color: '#F6F7F9',
                    }}
                  >
                    {question}
                  </div>
                  {shouldShowPill && (
                    <div style={{ display: 'flex', marginTop: 8 * scale }}>
                      <Pill
                        text={yesNoLabel || longShortLabel}
                        tone={
                          yesNoLabel === 'Yes' || longShortLabel === 'Long'
                            ? 'success'
                            : 'danger'
                        }
                        scale={scale}
                      />
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
