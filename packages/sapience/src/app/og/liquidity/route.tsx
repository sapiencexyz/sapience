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
  LiquidityFooter,
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

    const low = lowRaw;
    const high = highRaw;

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
                <div
                  style={{
                    display: 'flex',
                    fontSize: 24 * scale,
                    lineHeight: `${30 * scale}px`,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.64)',
                  }}
                >
                  Prediction Market
                </div>
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
                      fontSize: 38 * scale,
                      lineHeight: `${48 * scale}px`,
                      fontWeight: 700,
                      letterSpacing: -0.16 * scale,
                      color: '#F6F7F9',
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
