import { getBlockieSrc } from '~/lib/avatar';

export const BASE_WIDTH = 1200;
export const BASE_HEIGHT = 630;
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
  const [regular, demi, bold] = await Promise.all([
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
  return { regular, demi, bold } as const;
}

export function fontsFromData(fonts: {
  regular: ArrayBuffer;
  demi: ArrayBuffer;
  bold: ArrayBuffer;
}) {
  return [
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
}

export function commonAssets(req: Request) {
  return {
    logoUrl: new URL('/sapience.svg', req.url).toString(),
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

export function formatMoney(numStr: string): string {
  return addThousandsSeparators(numStr);
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
          opacity: 0.75,
        }}
      />
    </div>
  );
}

export function Header({
  logoUrl,
  scale = 1,
}: {
  logoUrl: string;
  scale?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <img
        src={logoUrl}
        alt="Sapience"
        width={264 * scale}
        height={59 * scale}
        style={{ display: 'flex', width: 264 * scale, height: 59 * scale }}
      />
    </div>
  );
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
        color: 'rgba(255,255,255,0.64)',
      }}
    >
      {against
        ? count === 1
          ? 'Prediction Against'
          : 'Predictions Against'
        : count === 1
          ? 'Prediction'
          : 'Predictions'}
    </div>
  );
}

function truncateAddress(addr: string): string {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export function BottomIdentity({
  addr,
  avatarUrl,
  scale = 1,
}: {
  addr: string;
  avatarUrl?: string | null;
  scale?: number;
}) {
  const avatarSize = 144 * scale;
  const radius = 16 * scale;
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
              borderRadius: Math.max(2, Math.round(radius - 6 * scale)),
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
          color: 'rgba(255,255,255,0.72)',
        }}
      >
        {truncateAddress(addr)}
      </div>
    </div>
  );
}

export function StatsRow({
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
    returnPercent !== null && returnPercent < 100 ? '#DD524C' : '#22C55F';
  const hasReturn = Boolean(potentialReturn && showReturn);
  const labelWrapperStyle: React.CSSProperties = {
    display: 'flex',
    marginBottom: 6 * scale,
  };
  const valueStyle: React.CSSProperties = {
    display: 'flex',
    fontSize: 32 * scale,
    lineHeight: `${32 * scale}px`,
    fontWeight: 800,
    color: '#FFFFFF',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };
  const normalizedSymbol = (_symbol || '').trim();
  const symbolText =
    !normalizedSymbol || normalizedSymbol.toLowerCase() === 'usde'
      ? 'testUSDe'
      : normalizedSymbol;
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
            style={{ display: 'flex', alignItems: 'flex-end', gap: 8 * scale }}
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
                  color: '#FFFFFF',
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
            style={{ display: 'flex', alignItems: 'flex-end', gap: 8 * scale }}
          >
            <div
              style={{
                ...valueStyle,
                color: forceToWinGreen ? '#22C55F' : valueStyle.color,
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
                  color: forceToWinGreen ? '#22C55F' : '#FFFFFF',
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
          color: 'rgba(255,255,255,0.56)',
        }}
      >
        <span>Forecast the future on</span>
        <span style={{ marginLeft: 6 * scale, color: '#FFFFFF' }}>
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
export function LiquidityStatsRow({
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
    fontWeight: 800,
    color: '#FFFFFF',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };
  const symbolText = 'testUSDe';
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
            style={{ display: 'flex', alignItems: 'flex-end', gap: 8 * scale }}
          >
            <div style={valueStyle}>{lowPrice}</div>
            <div
              style={{
                display: 'flex',
                fontSize: 24 * scale,
                marginTop: 0,
                lineHeight: `${24 * scale}px`,
                fontWeight: 600,
                color: '#FFFFFF',
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
            style={{ display: 'flex', alignItems: 'flex-end', gap: 8 * scale }}
          >
            <div style={valueStyle}>{highPrice}</div>
            <div
              style={{
                display: 'flex',
                fontSize: 24 * scale,
                marginTop: 0,
                lineHeight: `${24 * scale}px`,
                fontWeight: 600,
                color: '#FFFFFF',
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
                color: '#22C55F',
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
          color: 'rgba(255,255,255,0.56)',
        }}
      >
        <span>Forecast the future on</span>
        <span style={{ marginLeft: 6 * scale, color: '#FFFFFF' }}>
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
export function ForecastStatsRow({
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
    fontWeight: 800,
    color: '#FFFFFF',
  };
  const colStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  };
  const oddsNumber = (() => {
    if (!odds) return null;
    const cleaned = String(odds).replace(/%/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  })();
  const oddsColor =
    oddsNumber !== null && oddsNumber < 50 ? '#DD524C' : '#22C55F';
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
                display: 'flex',
                fontSize: 32 * scale,
                lineHeight: `${40 * scale}px`,
                fontWeight: 800,
                color: oddsColor,
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
          color: 'rgba(255,255,255,0.56)',
        }}
      >
        <span>Forecast the future on</span>
        <span style={{ marginLeft: 6 * scale, color: '#FFFFFF' }}>
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
    background: '#040613',
    color: '#F6F7F9',
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

// Typography primitives
export function H1({
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
        fontSize: 44 * scale,
        lineHeight: `${56 * scale}px`,
        fontWeight: 700,
        letterSpacing: -0.16 * scale,
        opacity: 0.98,
      }}
    >
      {children}
    </div>
  );
}

export function SmallLabel({
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
        fontSize: 18 * scale,
        letterSpacing: 1 * scale,
        textTransform: 'uppercase',
        opacity: 0.64,
      }}
    >
      {children}
    </div>
  );
}

export function FooterLabel({
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
        color: 'rgba(255,255,255,0.64)',
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
    success: { bg: '#22C55F', fg: '#FFFFFF', border: 'none' },
    danger: { bg: '#DD524C', fg: '#FFFFFF', border: 'none' },
    neutral: {
      bg: 'rgba(11,16,33,0.06)',
      fg: '#0B1021',
      border: 'rgba(11,16,33,0.12)',
    },
    info: { bg: 'rgba(59,130,246,0.12)', fg: '#3B82F6', border: '#3B82F6' },
  };

export function Pill({
  text,
  tone = 'neutral',
  scale = 1,
}: {
  text: string;
  tone?: PillTone;
  scale?: number;
}) {
  const t = pillTones[tone];
  return (
    <div
      style={{
        display: 'flex',
        padding: `${6 * scale}px ${18 * scale}px`,
        borderRadius: 9999,
        background: t.bg,
        color: t.fg,
        fontWeight: 700,
        border: t.border === 'none' ? 'none' : `2px solid ${t.border}`,
        fontSize: 24 * scale,
      }}
    >
      {text}
    </div>
  );
}

export function StatCard({
  label,
  value,
  symbol,
  hint,
}: {
  label: string;
  value: string;
  symbol?: string | null;
  hint?: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 18,
        borderRadius: 18,
        background: 'rgba(11,16,33,0.045)',
        border: '1px solid rgba(11,16,33,0.09)',
      }}
    >
      <SmallLabel>{label}</SmallLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div
          style={{
            fontSize: 84,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: -1.2,
          }}
        >
          {value}
        </div>
        {symbol ? (
          <div style={{ fontSize: 30, opacity: 0.9, fontWeight: 650 }}>
            {symbol}
          </div>
        ) : null}
      </div>
      {hint ? (
        <div style={{ display: 'flex', fontSize: 18, opacity: 0.7 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// Shared right column for wager -> to win, no background.
export function WagerToWin({
  wager,
  payout,
  symbol,
  scale = 1,
}: {
  wager?: string | null;
  payout?: string | null;
  symbol?: string | null;
  scale?: number;
}) {
  const hasWager = Boolean(wager);
  const hasPayout = Boolean(payout);
  if (!hasWager && !hasPayout) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12 * scale,
        width: 420 * scale,
      }}
    >
      {hasWager ? (
        <div
          style={{
            display: 'flex',
            fontSize: 24 * scale,
            opacity: 0.9,
          }}
        >
          Wagered {wager} {symbol} to win
        </div>
      ) : null}
      {hasPayout ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12 * scale,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              fontSize: 68 * scale,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: -0.8 * scale,
            }}
          >
            {payout}
          </div>
          {symbol ? (
            <div
              style={{ fontSize: 26 * scale, opacity: 0.9, fontWeight: 600 }}
            >
              {symbol}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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

export function buildCacheHeaders(searchParams: URLSearchParams): HeadersInit {
  if (searchParams.has('cb')) {
    return { 'cache-control': 'public, max-age=31536000, immutable' };
  }
  return { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=60' };
}
