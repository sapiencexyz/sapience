import { ImageResponse } from 'next/og';

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

    const normalizeText = (val: string | null, max: number) =>
      (val || '')
        .toString()
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    const question =
      normalizeText(searchParams.get('q'), 160) || 'Trade on Sapience';
    const wager = normalizeText(searchParams.get('wager'), 32);
    const payout = normalizeText(searchParams.get('payout'), 32);
    const symbol = normalizeText(searchParams.get('symbol'), 16);
    const dir = normalizeText(searchParams.get('dir'), 16); // 'on Yes' | 'on No' | 'long' | 'short'

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

    // Resolve asset URLs from public folder
    const logoUrl = new URL('/sapience.svg', req.url).toString();
    const bgUrl = new URL('/share_bg.png', req.url).toString();

    // Load fonts from public folder
    const [avenirRegular, avenirDemi, avenirBold] = await Promise.all([
      fetch(
        new URL(
          '/AvenirNextRoundedRegular-1080183-export/AvenirNextRoundedRegular-1080183.ttf',
          req.url
        )
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL(
          '/AvenirNextRoundedDemi-1080178-export/AvenirNextRoundedDemi-1080178.ttf',
          req.url
        )
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL(
          '/AvenirNextRoundedBold-1080176-export/AvenirNextRoundedBold-1080176.ttf',
          req.url
        )
      ).then((res) => res.arrayBuffer()),
    ]);

    const width = 1200;
    const height = 630;

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 48,
            background: '#FFFFFF',
            color: '#0B1021',
            fontFamily:
              'AvenirNextRounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto',
            position: 'relative',
          }}
        >
          {/* Decorative background image in top-right */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: -48, // offset container padding to be flush with top
              right: -48, // offset container padding to be flush with right
              width: 800,
              height: 800,
            }}
          >
            <img
              src={bgUrl}
              alt=""
              width={800}
              height={800}
              style={{
                display: 'flex',
                width: 800,
                height: 800,
                objectFit: 'cover',
                opacity: 0.66,
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img
              src={logoUrl}
              alt="Sapience"
              width={264}
              height={59}
              style={{ display: 'flex', width: 264, height: 59 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div
              style={{
                display: 'flex',
                fontSize: 42,
                lineHeight: 1.2,
                fontWeight: 600,
                letterSpacing: -0.5,
              }}
            >
              {question}
            </div>
            {(wager || dir || payout) && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 26,
                  opacity: 0.95,
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex' }}>
                  Wagered {wager}
                  {wager ? ` ${symbol}` : ''}
                </div>
                {yesNoLabel || longShortLabel ? (
                  <>
                    <div
                      style={{
                        display: 'block',
                        marginLeft: -6,
                        marginRight: 6,
                        position: 'relative',
                        top: 8,
                      }}
                    >
                      on
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        padding: '6px 14px',
                        borderRadius: 999,
                        background:
                          yesNoLabel === 'Yes' || longShortLabel === 'Long'
                            ? 'rgba(16,185,129,0.15)'
                            : 'rgba(239,68,68,0.15)',
                        color:
                          yesNoLabel === 'Yes' || longShortLabel === 'Long'
                            ? '#10B981'
                            : '#EF4444',
                        fontWeight: 600,
                        border:
                          yesNoLabel === 'Yes' || longShortLabel === 'Long'
                            ? '2px solid #10B981'
                            : '2px solid #EF4444',
                        letterSpacing: 0.5,
                      }}
                    >
                      {yesNoLabel || longShortLabel}
                    </div>
                  </>
                ) : dir ? (
                  <div style={{ display: 'flex' }}>on {dir}</div>
                ) : null}
                {payout && (
                  <div style={{ display: 'flex' }}>
                    to win {payout} {symbol}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: 0.9,
              fontSize: 22,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', opacity: 0.7 }}>
                Ethereum Account Address
              </div>
              <div style={{ display: 'flex', opacity: 0.85 }}>{addr}</div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', opacity: 0.7 }}>
                Explore Prediction Markets
              </div>
              <div style={{ display: 'flex', opacity: 0.85, fontWeight: 600 }}>
                www.sapience.xyz
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: [
          {
            name: 'AvenirNextRounded',
            data: avenirRegular,
            weight: 400,
            style: 'normal',
          },
          {
            name: 'AvenirNextRounded',
            data: avenirDemi,
            weight: 600,
            style: 'normal',
          },
          {
            name: 'AvenirNextRounded',
            data: avenirBold,
            weight: 700,
            style: 'normal',
          },
        ],
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(`OG route error: ${message}`, { status: 500 });
  }
}
