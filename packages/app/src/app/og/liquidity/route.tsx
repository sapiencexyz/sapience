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
  baseContainerStyle,
  contentContainerStyle,
  LiquidityFooter,
  addThousandsSeparators,
  SectionLabel,
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

    const lowRaw = normalizeText(searchParams.get('low'), 32);
    const highRaw = normalizeText(searchParams.get('high'), 32);
    const symbol = normalizeText(searchParams.get('symbol'), 16);
    const question =
      normalizeText(searchParams.get('q'), 160) || 'Liquidity Position';

    const low = addThousandsSeparators(lowRaw);
    const high = addThousandsSeparators(highRaw);

    const rawAddr = (searchParams.get('addr') || '').toString();
    const cleanedAddr = rawAddr.replace(/\s/g, '').toLowerCase();
    const addr = /^0x[a-f0-9]{40}$/.test(cleanedAddr) ? cleanedAddr : '';

    const { bgUrl } = commonAssets(req);
    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);

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
                <SectionLabel scale={scale}>
                  Providing Prediction Market Liquidity For
                </SectionLabel>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20 * scale,
                  }}
                >
                  <div
                    style={{
                      display: 'block',
                      fontSize: 32 * scale,
                      lineHeight: `${40 * scale}px`,
                      fontWeight: 700,
                      letterSpacing: -0.16 * scale,
                      color: og.colors.brandWhite,
                      fontFamily:
                        'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    }}
                  >
                    {question}
                  </div>
                </div>
              </div>
            </div>

            <LiquidityFooter
              addr={addr}
              lowPrice={low}
              highPrice={high}
              symbol={symbol}
              scale={scale}
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
