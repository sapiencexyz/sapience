import { ImageResponse } from 'next/og';
import { isAddress, getAddress } from 'viem';
import { blo } from 'blo';
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
  SectionLabel,
  FONT_FAMILY,
  addThousandsSeparators,
  createErrorImageResponse,
} from '../_shared';
import { fetchProfileData, resolveEnsInfo } from '../_profile-helpers';

export const runtime = 'edge';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatPnL(pnl: number): { text: string; color: string } {
  const abs = Math.abs(pnl);
  const formatted = addThousandsSeparators(abs.toFixed(2));
  if (pnl >= 0) {
    return { text: `+${formatted}`, color: og.colors.success };
  }
  return { text: `-${formatted}`, color: og.colors.danger };
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

    const rawAddress = searchParams.get('address');
    if (!rawAddress || !isAddress(rawAddress)) {
      return createErrorImageResponse(new Error('Missing or invalid address'));
    }

    const address = getAddress(rawAddress);

    // Fetch data in parallel
    const [profileData, ensInfo, fonts] = await Promise.all([
      fetchProfileData(address),
      resolveEnsInfo(address),
      loadFontData(req),
    ]);

    const { bgUrl } = commonAssets(req);
    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);

    // Avatar: ENS avatar (pre-validated) or blockie fallback
    const blockieSrc = blo(address);
    let avatarSrc = blockieSrc;
    if (ensInfo.avatarUrl) {
      try {
        const check = await fetch(ensInfo.avatarUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000),
        });
        if (check.ok) avatarSrc = ensInfo.avatarUrl;
      } catch {
        // Unreachable or slow — fall back to blockie
      }
    }
    const avatarSize = Math.round(100 * scale);

    // Build two rows of metrics
    type Metric = { label: string; value: string; color?: string };
    const tradingRow: Metric[] = [];
    const forecastingRow: Metric[] = [];

    if (profileData.totalPnL !== null) {
      const pnl = formatPnL(profileData.totalPnL);
      tradingRow.push({
        label: 'Profit/Loss',
        value: `${pnl.text} USDe`,
        color: pnl.color,
      });
    }
    if (profileData.volumeDisplay) {
      tradingRow.push({
        label: 'Volume',
        value: `${profileData.volumeDisplay} USDe`,
      });
    }
    if (profileData.profitRank !== null) {
      tradingRow.push({ label: 'Rank', value: `#${profileData.profitRank}` });
    }

    if (profileData.accuracyScore !== null && profileData.accuracyScore !== 0) {
      forecastingRow.push({
        label: 'Accuracy Score',
        value: addThousandsSeparators(
          String(Math.round(profileData.accuracyScore))
        ),
      });
    }
    if (profileData.forecastsCount !== null && profileData.forecastsCount > 0) {
      forecastingRow.push({
        label: 'Forecasts',
        value: addThousandsSeparators(String(profileData.forecastsCount)),
      });
    }
    if (profileData.accuracyRank !== null) {
      forecastingRow.push({
        label: 'Rank',
        value: `#${profileData.accuracyRank}`,
      });
    }

    const imageResponse = new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />

          <div style={contentContainerStyle(scale)}>
            {/* Top section: identity */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24 * scale,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    borderRadius: 16 * scale,
                    background: og.colors.backgroundDark,
                    width: avatarSize,
                    height: avatarSize,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={avatarSrc}
                    alt=""
                    width={avatarSize}
                    height={avatarSize}
                    style={{
                      display: 'flex',
                      width: '100%',
                      height: '100%',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 48 * scale,
                    lineHeight: `${56 * scale}px`,
                    fontWeight: 700,
                    color: og.colors.brandWhite,
                    fontFamily: FONT_FAMILY.mono,
                  }}
                >
                  {ensInfo.name || truncateAddress(address)}
                </div>
              </div>
            </div>

            {/* Bottom section: stats rows + tagline */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[tradingRow, forecastingRow].map(
                (row, rowIdx) =>
                  row.length > 0 && (
                    <div
                      key={rowIdx}
                      style={{
                        display: 'flex',
                        gap: 28 * scale,
                        justifyContent: 'flex-start',
                        marginBottom: 28 * scale,
                      }}
                    >
                      {row.map((metric) => (
                        <div
                          key={metric.label}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              marginBottom: 8 * scale,
                            }}
                          >
                            <SectionLabel scale={scale}>
                              {metric.label}
                            </SectionLabel>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              fontSize: 32 * scale,
                              lineHeight: `${40 * scale}px`,
                              fontWeight: 600,
                              color: metric.color || og.colors.brandWhite,
                              fontFamily: FONT_FAMILY.mono,
                            }}
                          >
                            {metric.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
              )}
              <Tagline scale={scale} />
            </div>
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
      'public, max-age=900, s-maxage=900, stale-while-revalidate=1800'
    );

    return imageResponse;
  } catch (err) {
    return createErrorImageResponse(err);
  }
}
