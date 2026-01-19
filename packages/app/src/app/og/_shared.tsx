import { getBlockieSrc } from '~/lib/avatar';
import { og } from '~/lib/theme/ogPalette';

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 630;
export const WIDTH = 2400; // default 2×
export const HEIGHT = 1260;

export function getScale(width: number) {
  return width / BASE_WIDTH;
}

export function normalizeText(val: string | null, max: number): string {
  return (val || '')
    .toString()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function loadFontData(req: Request) {
  const fetchOptionalFont = async (path: string, timeoutMs = 250) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(new URL(path, req.url), {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  };

  const [regular, demi, bold, plex400, plex600] = await Promise.all([
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
    // IBM Plex Mono - load reliably like Avenir fonts (no short timeout)
    fetchOptionalFont('/fonts/ibm-plex-mono/plex-mono-400.woff', 5000),
    fetchOptionalFont('/fonts/ibm-plex-mono/plex-mono-600.woff', 5000),
  ]);
  return { regular, demi, bold, plex400, plex600 } as const;
}

export function fontsFromData(fonts: {
  regular: ArrayBuffer;
  demi: ArrayBuffer;
  bold: ArrayBuffer;
  plex400?: ArrayBuffer | null;
  plex600?: ArrayBuffer | null;
}) {
  const out: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 600 | 700;
    style: 'normal';
  }> = [
    {
      name: 'AvenirNextRounded',
      data: fonts.regular,
      weight: 400 as const,
      style: 'normal' as const,
    },
    {
      name: 'AvenirNextRounded',
      data: fonts.demi,
      weight: 600 as const,
      style: 'normal' as const,
    },
    {
      name: 'AvenirNextRounded',
      data: fonts.bold,
      weight: 700 as const,
      style: 'normal' as const,
    },
  ];
  if (fonts.plex400) {
    out.push({
      name: 'IBMPlexMono',
      data: fonts.plex400,
      weight: 400,
      style: 'normal',
    });
  }
  if (fonts.plex600) {
    out.push({
      name: 'IBMPlexMono',
      data: fonts.plex600,
      weight: 600,
      style: 'normal',
    });
  }
  return out;
}

export function commonAssets(req: Request) {
  return {
    logoUrl: new URL('/logo.svg', req.url).toString(),
    bgUrl: new URL('/share_bg.png', req.url).toString(),
  } as const;
}

export function addThousandsSeparators(numStr: string): string {
  if (!numStr) return '';
  const safe = String(numStr).replace(/,/g, '').trim();
  if (!safe) return '';
  const [intPart, fracPart] = safe.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fracPart ? `${withCommas}.${fracPart}` : withCommas;
}

// Normalize currency symbols used on OG cards. Default to USDe if empty.
function normalizeSymbol(symbol?: string | null): string {
  const s = (symbol || '').trim();
  if (!s) return 'USDe';
  return s;
}

export function Background({
  bgUrl,
  scale = 1,
}: {
  bgUrl: string;
  scale?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    >
      <img
        src={bgUrl}
        alt=""
        width={BASE_WIDTH * scale}
        height={BASE_HEIGHT * scale}
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          opacity: 0.6,
        }}
      />
    </div>
  );
}

function getPredictionsLabelText(count?: number, against?: boolean): string {
  if (against) return 'Predicted Against';
  if (count === 1) return 'Prediction';
  return 'Predictions';
}

export function PredictionsLabel({
  scale = 1,
  count,
  against = false,
}: {
  scale?: number;
  count?: number;
  against?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 24 * scale,
        lineHeight: `${30 * scale}px`,
        fontWeight: 600,
        color: og.colors.foregroundLight,
        textTransform: 'uppercase',
        letterSpacing: 0.06 * scale + 'em',
      }}
    >
      {getPredictionsLabelText(count, against)}
    </div>
  );
}

function truncateAddress(addr: string): string {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function BottomIdentity({
  addr,
  avatarUrl,
  scale = 1,
}: {
  addr: string;
  avatarUrl?: string | null;
  scale?: number;
}) {
  const avatarSize = 144 * scale;
  const radius = 6 * scale; // tighter rounding per request
  return (
    <div
      style={{
        display: 'flex',
        width: 180 * scale,
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: avatarSize,
          height: avatarSize,
          display: 'flex',
        }}
      >
        <img
          src={getBlockieSrc(addr)}
          alt=""
          width={avatarSize}
          height={avatarSize}
          style={{
            display: 'flex',
            width: avatarSize,
            height: avatarSize,
            borderRadius: radius,
            objectFit: 'cover',
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid rgba(255,255,255,0.1)`,
          }}
        />
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            width={avatarSize}
            height={avatarSize}
            style={{
              position: 'absolute',
              top: Math.max(2, Math.round(6 * scale)),
              left: Math.max(2, Math.round(6 * scale)),
              display: 'flex',
              width: avatarSize - Math.max(4, Math.round(12 * scale)),
              height: avatarSize - Math.max(4, Math.round(12 * scale)),
              borderRadius: Math.max(2, Math.round(radius - 2 * scale)),
              objectFit: 'contain',
              background: 'rgba(0,0,0,0.08)',
              border: `1px solid rgba(255,255,255,0.12)`,
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 12 * scale,
          fontSize: 20 * scale,
          lineHeight: `${24 * scale}px`,
          fontWeight: 600,
          color: og.colors.mutedWhite64,
          fontFamily:
            'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
      >
        {truncateAddress(addr)}
      </div>
    </div>
  );
}

function StatsRow({
  wager,
  payout,
  potentialReturn,
  symbol: _symbol,
  scale = 1,
  showReturn = true,
  forceToWinGreen = false,
}: {
  wager?: string;
  payout?: string;
  potentialReturn?: string | null;
  symbol?: string;
  scale?: number;
  showReturn?: boolean;
  forceToWinGreen?: boolean;
}) {
  const parseNumber = (val?: string | null): number => {
    if (!val) return 0;
    const cleaned = String(val).replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const wagerNum = parseNumber(wager);
  const returnNum = parseNumber(potentialReturn);
  const returnPercent =
    wagerNum > 0 && returnNum > 0
      ? Math.round((returnNum / wagerNum) * 100)
      : null;
  const returnColor =
    returnPercent !== null && returnPercent < 100
      ? og.colors.danger
      : og.colors.success;
  const hasReturn = Boolean(potentialReturn && showReturn);
  const labelWrapperStyle: React.CSSProperties = {
    display: 'flex',
    marginBottom: 6 * scale,
  };
  const valueStyle: React.CSSProperties = {
    display: 'flex',
    fontSize: 32 * scale,
    lineHeight: `${32 * scale}px`,
    fontWeight: 600,
    color: og.colors.brandWhite,
    fontFamily:
      'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };
  const symbolText = normalizeSymbol(_symbol);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          gap: 28 * scale,
          justifyContent: 'space-between',
        }}
      >
        <div
          style={
            hasReturn
              ? colStyle
              : {
                  ...colStyle,
                  flex: `0 0 ${300 * scale}px`,
                  width: 300 * scale,
                }
          }
        >
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>Wagered</FooterLabel>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8 * scale,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={valueStyle}>{wager}</div>
            {symbolText ? (
              <div
                style={{
                  display: 'flex',
                  fontSize: 24 * scale,
                  marginTop: 0,
                  lineHeight: `${24 * scale}px`,
                  fontWeight: 600,
                  color: og.colors.white,
                  fontFamily:
                    'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
              >
                {symbolText}
              </div>
            ) : null}
          </div>
        </div>
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>To Win</FooterLabel>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8 * scale,
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                ...valueStyle,
                color: forceToWinGreen ? og.colors.success : valueStyle.color,
              }}
            >
              {payout}
            </div>
            {symbolText ? (
              <div
                style={{
                  display: 'flex',
                  fontSize: 24 * scale,
                  marginTop: 0,
                  lineHeight: `${24 * scale}px`,
                  fontWeight: 600,
                  color: forceToWinGreen ? og.colors.success : og.colors.white,
                  fontFamily:
                    'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
              >
                {symbolText}
              </div>
            ) : null}
          </div>
        </div>
        {hasReturn ? (
          <div style={colStyle}>
            <div style={labelWrapperStyle}>
              <FooterLabel scale={scale}>Return</FooterLabel>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8 * scale,
              }}
            >
              {returnPercent !== null ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 32 * scale,
                    lineHeight: `${32 * scale}px`,
                    fontWeight: 800,
                    color: returnColor,
                  }}
                >
                  {addThousandsSeparators(String(returnPercent))}%
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 16 * scale,
          justifyContent: 'flex-start',
          fontSize: 27 * scale,
          lineHeight: `${36 * scale}px`,
          fontWeight: 600,
          color: og.colors.foregroundLight,
        }}
      >
        <span>Forecast the future on</span>
        <span style={{ marginLeft: 6 * scale, color: og.colors.accentGold }}>
          www.sapience.xyz
        </span>
      </div>
    </div>
  );
}

export function Footer({
  addr,
  avatarUrl,
  wager,
  payout,
  symbol,
  potentialReturn,
  scale = 1,
  showReturn = true,
  forceToWinGreen = false,
}: {
  addr: string;
  avatarUrl?: string | null;
  wager?: string;
  payout?: string;
  symbol?: string;
  potentialReturn?: string | null;
  scale?: number;
  showReturn?: boolean;
  forceToWinGreen?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16 * scale,
        // Shift footer content left by avatar width + gap so StatsRow left aligns with Predictions
        marginLeft: -(180 + 34) * scale,
        // Reduce right padding to give more room for StatsRow columns
        marginRight: -40 * scale,
      }}
    >
      <div style={{ display: 'flex', marginLeft: (180 + 16) * scale }}>
        <BottomIdentity addr={addr} avatarUrl={avatarUrl} scale={scale} />
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          marginTop: -32 * scale,
        }}
      >
        <StatsRow
          wager={wager}
          payout={payout}
          symbol={symbol}
          potentialReturn={potentialReturn}
          scale={scale}
          showReturn={showReturn}
          forceToWinGreen={forceToWinGreen}
        />
      </div>
    </div>
  );
}

// Liquidity share card stats row
function LiquidityStatsRow({
  lowPrice,
  highPrice,
  symbol: _symbol,
  scale = 1,
}: {
  lowPrice?: string | null;
  highPrice?: string | null;
  symbol?: string | null;
  scale?: number;
}) {
  const labelWrapperStyle: React.CSSProperties = {
    display: 'flex',
    marginBottom: 6 * scale,
  };
  const valueStyle: React.CSSProperties = {
    display: 'flex',
    fontSize: 32 * scale,
    lineHeight: `${32 * scale}px`,
    fontWeight: 600,
    color: og.colors.brandWhite,
    fontFamily:
      'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };
  const symbolText = normalizeSymbol(_symbol || '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          gap: 28 * scale,
          justifyContent: 'space-between',
        }}
      >
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>Low Price</FooterLabel>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8 * scale,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={valueStyle}>{lowPrice}</div>
            <div
              style={{
                display: 'flex',
                fontSize: 24 * scale,
                marginTop: 0,
                lineHeight: `${24 * scale}px`,
                fontWeight: 600,
                color: og.colors.white,
                fontFamily:
                  'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {symbolText}
            </div>
          </div>
        </div>
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>High Price</FooterLabel>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8 * scale,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={valueStyle}>{highPrice}</div>
            <div
              style={{
                display: 'flex',
                fontSize: 24 * scale,
                marginTop: 0,
                lineHeight: `${24 * scale}px`,
                fontWeight: 600,
                color: og.colors.white,
                fontFamily:
                  'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {symbolText}
            </div>
          </div>
        </div>
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>Fee</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 32 * scale,
                lineHeight: `${40 * scale}px`,
                fontWeight: 800,
                color: og.colors.success,
              }}
            >
              1%
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 16 * scale,
          justifyContent: 'flex-start',
          fontSize: 27 * scale,
          lineHeight: `${36 * scale}px`,
          fontWeight: 600,
          color: og.colors.foregroundLight,
        }}
      >
        <span>Forecast the future on</span>
        <span style={{ marginLeft: 6 * scale, color: og.colors.accentGold }}>
          www.sapience.xyz
        </span>
      </div>
    </div>
  );
}

export function LiquidityFooter({
  addr,
  avatarUrl,
  lowPrice,
  highPrice,
  symbol,
  scale = 1,
}: {
  addr: string;
  avatarUrl?: string | null;
  lowPrice?: string | null;
  highPrice?: string | null;
  symbol?: string | null;
  scale?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16 * scale,
        marginLeft: -(180 + 34) * scale,
        marginRight: -40 * scale,
      }}
    >
      <div style={{ display: 'flex', marginLeft: (180 + 16) * scale }}>
        <BottomIdentity addr={addr} avatarUrl={avatarUrl} scale={scale} />
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          marginTop: -32 * scale,
        }}
      >
        <LiquidityStatsRow
          lowPrice={lowPrice || ''}
          highPrice={highPrice || ''}
          symbol={symbol || ''}
          scale={scale}
        />
      </div>
    </div>
  );
}

// Forecast share card stats row
function ForecastStatsRow({
  resolution,
  horizon,
  odds,
  scale = 1,
}: {
  resolution?: string | null;
  horizon?: string | null;
  odds?: string | null; // e.g., "89%" (we color based on numeric value)
  scale?: number;
}) {
  const labelWrapperStyle: React.CSSProperties = {
    display: 'flex',
    marginBottom: 6 * scale,
  };
  const valueStyle: React.CSSProperties = {
    display: 'flex',
    fontSize: 32 * scale,
    lineHeight: `${40 * scale}px`,
    fontWeight: 600,
    color: og.colors.brandWhite,
    fontFamily:
      'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          gap: 28 * scale,
          justifyContent: 'space-between',
        }}
      >
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>Resolution</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div style={valueStyle}>{resolution}</div>
          </div>
        </div>
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>Horizon</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div style={valueStyle}>{horizon}</div>
          </div>
        </div>
        <div style={colStyle}>
          <div style={labelWrapperStyle}>
            <FooterLabel scale={scale}>Prediction</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div
              style={{
                ...valueStyle,
              }}
            >
              {odds ? `${odds} Chance` : ''}
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 16 * scale,
          justifyContent: 'flex-start',
          fontSize: 27 * scale,
          lineHeight: `${36 * scale}px`,
          fontWeight: 600,
          color: og.colors.foregroundLight,
        }}
      >
        <span>Forecast the future on</span>
        <span style={{ marginLeft: 6 * scale, color: og.colors.accentGold }}>
          www.sapience.xyz
        </span>
      </div>
    </div>
  );
}

export function ForecastFooter({
  addr,
  avatarUrl,
  resolution,
  horizon,
  odds,
  scale = 1,
}: {
  addr: string;
  avatarUrl?: string | null;
  resolution?: string | null;
  horizon?: string | null;
  odds?: string | null;
  scale?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16 * scale,
        marginLeft: -(180 + 34) * scale,
        marginRight: -40 * scale,
      }}
    >
      <div style={{ display: 'flex', marginLeft: (180 + 16) * scale }}>
        <BottomIdentity addr={addr} avatarUrl={avatarUrl} scale={scale} />
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          marginTop: -32 * scale,
        }}
      >
        <ForecastStatsRow
          resolution={resolution || ''}
          horizon={horizon || ''}
          odds={odds || ''}
          scale={scale}
        />
      </div>
    </div>
  );
}

export function baseContainerStyle(): React.CSSProperties {
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 0,
    background: og.colors.backgroundDark,
    color: og.colors.foregroundLight,
    fontFamily:
      'AvenirNextRounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto',
    position: 'relative',
  } as const;
}

export function contentContainerStyle(scale = 1): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingTop: (80 - 40) * scale,
    paddingRight: 80 * scale,
    paddingBottom: (80 - 40) * scale,
    paddingLeft: 80 * scale,
    width: '100%',
    height: '100%',
  } as const;
}

// SectionLabel matches the small caps section headings used on OG cards, scaled.
export function SectionLabel({
  children,
  scale = 1,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 24 * scale,
        lineHeight: `${30 * scale}px`,
        fontWeight: 600,
        color: og.colors.foregroundLight,
        textTransform: 'uppercase',
        letterSpacing: 0.06 * scale + 'em',
      }}
    >
      {children}
    </div>
  );
}

function FooterLabel({
  children,
  scale = 1,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 24 * scale,
        lineHeight: `${30 * scale}px`,
        fontWeight: 600,
        color: og.colors.foregroundLight,
        textTransform: 'uppercase',
        letterSpacing: 0.06 * scale + 'em',
      }}
    >
      {children}
    </div>
  );
}

// Visual primitives
type PillTone = 'success' | 'danger' | 'neutral' | 'info';

const pillTones: Record<PillTone, { bg: string; fg: string; border: string }> =
  {
    success: { bg: og.colors.success, fg: og.colors.white, border: 'none' },
    danger: { bg: og.colors.danger, fg: og.colors.white, border: 'none' },
    neutral: {
      bg: og.colors.neutralBg06,
      fg: og.colors.neutralFg,
      border: og.colors.neutralBorder12,
    },
    info: {
      bg: og.colors.infoBg12,
      fg: og.colors.info,
      border: og.colors.info,
    },
  };

// Convert CSS color string to rgba with given alpha
function toRgba(css: string, alpha: number): string {
  if (!css) return css;

  if (css.startsWith('rgb(')) {
    const inside = css.slice(4, -1);
    return `rgba(${inside}, ${alpha})`;
  }

  if (css.startsWith('#')) {
    const hex = css.replace('#', '');
    const normalizedHex =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    const bigint = parseInt(normalizedHex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (css.startsWith('hsl(')) {
    const inside = css.slice(4, -1).split('/')[0].trim();
    const [hStr, sStr, lStr] = inside.split(/\s+/);
    const h = parseFloat(hStr);
    const s = parseFloat(sStr.replace('%', '')) / 100;
    const l = parseFloat(lStr.replace('%', '')) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (h >= 0 && h < 60) {
      r1 = c;
      g1 = x;
    } else if (h < 120) {
      r1 = x;
      g1 = c;
    } else if (h < 180) {
      g1 = c;
      b1 = x;
    } else if (h < 240) {
      g1 = x;
      b1 = c;
    } else if (h < 300) {
      r1 = x;
      b1 = c;
    } else {
      r1 = c;
      b1 = x;
    }

    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return css;
}

function getPillColors(tone: PillTone): {
  border: string;
  fg: string;
  bg: string;
} {
  const t = pillTones[tone];

  if (tone === 'success') {
    return {
      border: toRgba(og.colors.success, 0.45),
      fg: og.colors.success,
      bg: toRgba(og.colors.success, 0.1),
    };
  }

  if (tone === 'danger') {
    return {
      border: toRgba(og.colors.danger, 0.45),
      fg: og.colors.danger,
      bg: toRgba(og.colors.danger, 0.1),
    };
  }

  return { border: t.border, fg: t.fg, bg: t.bg };
}

function computePillStyle(scale: number, tone: PillTone): React.CSSProperties {
  const isHighlighted = tone === 'success' || tone === 'danger';
  const colors = getPillColors(tone);

  const borderWidth = Math.max(1, Math.round((isHighlighted ? 2 : 1) * scale));
  const paddingY = Math.max(0, Math.round(3 * scale));
  const paddingX = Math.max(0, Math.round(10 * scale));
  const fontSize = Math.round(20 * scale);
  const lineHeight = Math.round(24 * scale);

  return {
    display: 'flex',
    alignItems: 'center',
    padding: `${paddingY}px ${paddingX}px`,
    borderRadius: Math.round(6 * scale),
    background: colors.bg,
    color: colors.fg,
    fontWeight: 500,
    borderStyle: 'solid',
    borderWidth,
    borderColor: colors.border,
    fontSize,
    lineHeight: `${lineHeight}px`,
    fontFamily: isHighlighted
      ? 'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      : undefined,
  };
}

export function Pill({
  text,
  tone = 'neutral',
  scale = 1,
}: {
  text: string;
  tone?: PillTone;
  scale?: number;
}) {
  return <div style={computePillStyle(scale, tone)}>{text}</div>;
}

export function computePotentialReturn(
  wager: string,
  payout: string
): string | null {
  const w = Number(String(wager || '0').replace(/,/g, ''));
  const p = Number(String(payout || '0').replace(/,/g, ''));
  if (!Number.isFinite(w) || !Number.isFinite(p)) return null;
  // For ROI we want profit ("to win") over wager, not stake+profit.
  // Return the "to win" amount so downstream percent is p / w.
  const profit = p;
  if (profit <= 0) return null;
  return addThousandsSeparators(profit.toFixed(profit < 1 ? 4 : 2));
}

export { og };
