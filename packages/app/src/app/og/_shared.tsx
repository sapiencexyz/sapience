import { ImageResponse } from 'next/og';
import { og } from '~/lib/theme/ogPalette';

export const FONT_FAMILY = {
  mono: 'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  sans: 'AvenirNextRounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto',
} as const;

export const WIDTH = 1200;
export const HEIGHT = 630;

export function getScale(width: number) {
  return width / 1200;
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
        cache: 'force-cache',
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
      ),
      { cache: 'force-cache' }
    ).then((res) => res.arrayBuffer()),
    fetch(
      new URL(
        '/AvenirNextRoundedDemi-1080178-export/AvenirNextRoundedDemi-1080178.ttf',
        req.url
      ),
      { cache: 'force-cache' }
    ).then((res) => res.arrayBuffer()),
    fetch(
      new URL(
        '/AvenirNextRoundedBold-1080176-export/AvenirNextRoundedBold-1080176.ttf',
        req.url
      ),
      { cache: 'force-cache' }
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
    bgUrl: new URL('/share.png', req.url).toString(),
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
        width={1200 * scale}
        height={630 * scale}
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
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
        fontSize: 20 * scale,
        lineHeight: `${26 * scale}px`,
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

// Shared tagline component for footer
export function Tagline({ scale = 1 }: { scale?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        marginTop: 16 * scale,
        justifyContent: 'flex-start',
        fontSize: 22 * scale,
        lineHeight: `${36 * scale}px`,
        fontWeight: 400,
        fontFamily: FONT_FAMILY.mono,
        color: og.colors.accentGold,
      }}
    >
      <span style={{ color: og.colors.mutedWhite64 }}>
        powered by open source prediction markets on
      </span>
      <span style={{ marginLeft: 12 * scale }}>sapience.xyz</span>
    </div>
  );
}

// Creates common styles used across all stats row variants
function createStatsRowStyles(scale: number) {
  return {
    labelWrapperStyle: {
      display: 'flex',
      marginBottom: 8 * scale,
    } as React.CSSProperties,
    valueStyle: {
      display: 'flex',
      fontSize: 32 * scale,
      lineHeight: `${40 * scale}px`,
      fontWeight: 600,
      color: og.colors.brandWhite,
      fontFamily: FONT_FAMILY.mono,
    } as React.CSSProperties,
    colStyle: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
    } as React.CSSProperties,
    containerStyle: {
      display: 'flex',
      flexDirection: 'column',
    } as React.CSSProperties,
    rowStyle: {
      display: 'flex',
      gap: 28 * scale,
      justifyContent: 'space-between',
    } as React.CSSProperties,
  };
}

function StatsRow({
  positionSize,
  payout,
  potentialReturn,
  implied,
  symbol: _symbol,
  scale = 1,
  showReturn = true,
  forcePayoutGreen = false,
}: {
  positionSize?: string;
  payout?: string;
  potentialReturn?: string | null;
  implied?: string | null;
  symbol?: string;
  scale?: number;
  showReturn?: boolean;
  forcePayoutGreen?: boolean;
}) {
  const parseNumber = (val?: string | null): number => {
    if (!val) return 0;
    const cleaned = String(val).replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };
  const positionSizeNum = parseNumber(positionSize);
  const returnNum = parseNumber(potentialReturn);
  const returnPercent =
    positionSizeNum > 0 && returnNum > 0
      ? Math.round((returnNum / positionSizeNum) * 100)
      : null;
  const returnColor =
    returnPercent !== null && returnPercent < 100
      ? og.colors.danger
      : og.colors.success;
  const hasPayout = Boolean(payout);
  const hasReturn = Boolean(potentialReturn && showReturn);
  const styles = createStatsRowStyles(scale);
  const symbolText = normalizeSymbol(_symbol);
  return (
    <div style={styles.containerStyle}>
      <div style={styles.rowStyle}>
        <div
          style={
            hasReturn || hasPayout
              ? styles.colStyle
              : {
                  ...styles.colStyle,
                  flex: `0 0 ${300 * scale}px`,
                  width: 300 * scale,
                }
          }
        >
          <div style={styles.labelWrapperStyle}>
            <FooterLabel scale={scale}>Position Size</FooterLabel>
          </div>
          <div style={styles.valueStyle}>
            {positionSize}
            {symbolText ? ` ${symbolText}` : ''}
          </div>
        </div>
        {hasPayout ? (
          <div style={styles.colStyle}>
            <div style={styles.labelWrapperStyle}>
              <FooterLabel scale={scale}>Payout</FooterLabel>
            </div>
            <div
              style={{
                ...styles.valueStyle,
                color: forcePayoutGreen
                  ? og.colors.success
                  : styles.valueStyle.color,
              }}
            >
              {payout}
              {symbolText ? ` ${symbolText}` : ''}
            </div>
          </div>
        ) : null}
        {hasPayout && implied ? (
          <div style={styles.colStyle}>
            <div style={styles.labelWrapperStyle}>
              <FooterLabel scale={scale}>Implied</FooterLabel>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8 * scale,
                whiteSpace: 'nowrap',
              }}
            >
              <div
                style={{
                  ...styles.valueStyle,
                  color: og.colors.ethenaBlue,
                }}
              >
                {implied} Chance
              </div>
            </div>
          </div>
        ) : null}
        {hasReturn ? (
          <div style={styles.colStyle}>
            <div style={styles.labelWrapperStyle}>
              <FooterLabel scale={scale}>Return</FooterLabel>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
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
      <Tagline scale={scale} />
    </div>
  );
}

export function Footer({
  positionSize,
  payout,
  symbol,
  potentialReturn,
  implied,
  scale = 1,
  showReturn = true,
  forcePayoutGreen = false,
}: {
  positionSize?: string;
  payout?: string;
  symbol?: string;
  potentialReturn?: string | null;
  implied?: string | null;
  scale?: number;
  showReturn?: boolean;
  forcePayoutGreen?: boolean;
}) {
  return (
    <StatsRow
      positionSize={positionSize}
      payout={payout}
      symbol={symbol}
      potentialReturn={potentialReturn}
      implied={implied}
      scale={scale}
      showReturn={showReturn}
      forcePayoutGreen={forcePayoutGreen}
    />
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
  const styles = createStatsRowStyles(scale);
  // Override lineHeight for forecast stats row to match original
  const valueStyle = { ...styles.valueStyle, lineHeight: `${40 * scale}px` };
  return (
    <div style={styles.containerStyle}>
      <div style={styles.rowStyle}>
        <div style={styles.colStyle}>
          <div style={styles.labelWrapperStyle}>
            <FooterLabel scale={scale}>Resolution</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div style={valueStyle}>{resolution}</div>
          </div>
        </div>
        <div style={styles.colStyle}>
          <div style={styles.labelWrapperStyle}>
            <FooterLabel scale={scale}>Horizon</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div style={valueStyle}>{horizon}</div>
          </div>
        </div>
        <div style={styles.colStyle}>
          <div style={styles.labelWrapperStyle}>
            <FooterLabel scale={scale}>Prediction</FooterLabel>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: 8 * scale }}
          >
            <div style={valueStyle}>{odds ? `${odds} Chance` : ''}</div>
          </div>
        </div>
      </div>
      <Tagline scale={scale} />
    </div>
  );
}

export function ForecastFooter({
  resolution,
  horizon,
  odds,
  scale = 1,
}: {
  resolution?: string | null;
  horizon?: string | null;
  odds?: string | null;
  scale?: number;
}) {
  return (
    <ForecastStatsRow
      resolution={resolution || ''}
      horizon={horizon || ''}
      odds={odds || ''}
      scale={scale}
    />
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
    fontFamily: FONT_FAMILY.sans,
    position: 'relative',
  } as const;
}

export function contentContainerStyle(scale = 1): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingTop: 80 * scale,
    paddingRight: 40 * scale,
    paddingBottom: 40 * scale,
    paddingLeft: 40 * scale,
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
        fontSize: 20 * scale,
        lineHeight: `${26 * scale}px`,
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
        fontSize: 20 * scale,
        lineHeight: `${26 * scale}px`,
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
      border: toRgba(og.colors.success, 0.6),
      fg: og.colors.success,
      bg: toRgba(og.colors.success, 0.2),
    };
  }

  if (tone === 'danger') {
    return {
      border: toRgba(og.colors.danger, 0.6),
      fg: og.colors.danger,
      bg: toRgba(og.colors.danger, 0.2),
    };
  }

  return { border: t.border, fg: t.fg, bg: t.bg };
}

function computePillStyle(
  scale: number,
  tone: PillTone,
  compact = false
): React.CSSProperties {
  const isHighlighted = tone === 'success' || tone === 'danger';
  const colors = getPillColors(tone);

  const borderWidth = Math.max(1, Math.round((isHighlighted ? 2 : 1) * scale));
  const paddingY = Math.max(0, Math.round((compact ? 2 : 3) * scale));
  const paddingX = Math.max(0, Math.round((compact ? 7 : 10) * scale));
  const fontSize = Math.round((compact ? 14 : 20) * scale);
  const lineHeight = Math.round((compact ? 18 : 24) * scale);

  return {
    display: 'flex',
    alignItems: 'center',
    padding: `${paddingY}px ${paddingX}px`,
    borderRadius: Math.round((compact ? 4 : 6) * scale),
    background: colors.bg,
    color: colors.fg,
    fontWeight: 600,
    borderStyle: 'solid',
    borderWidth,
    borderColor: colors.border,
    fontSize,
    lineHeight: `${lineHeight}px`,
    fontFamily: FONT_FAMILY.mono,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
}

export function Pill({
  text,
  tone = 'neutral',
  scale = 1,
  compact = false,
}: {
  text: string;
  tone?: PillTone;
  scale?: number;
  compact?: boolean;
}) {
  return <div style={computePillStyle(scale, tone, compact)}>{text}</div>;
}

export function computePotentialReturn(
  positionSize: string,
  payout: string
): string | null {
  const w = Number(String(positionSize || '0').replace(/,/g, ''));
  const p = Number(String(payout || '0').replace(/,/g, ''));
  if (!Number.isFinite(w) || !Number.isFinite(p)) return null;
  // For ROI we want profit (payout) over position size, not stake+profit.
  // Return the payout amount so downstream percent is p / w.
  const profit = p;
  if (profit <= 0) return null;
  return addThousandsSeparators(profit.toFixed(profit < 1 ? 4 : 2));
}

export function ErrorOGImage({ message }: { message: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: og.colors.backgroundDark,
        color: og.colors.foregroundLight,
        fontFamily: FONT_FAMILY.sans,
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, opacity: 0.86 }}>
        Error: {message}
      </div>
    </div>
  );
}

export function createErrorImageResponse(err: unknown): ImageResponse {
  const message = err instanceof Error ? err.message : 'Unknown error';
  return new ImageResponse(<ErrorOGImage message={message} />, {
    width: WIDTH,
    height: HEIGHT,
  });
}

// Resolution status for position legs
export type ResolutionStatus = 'correct' | 'incorrect' | 'pending';

// Inline resolution icon rendered to the left of each prediction question.
// Renders a filled circle (20% opacity) with a status icon stroke in full color.
// Uses separate return paths per status to avoid fragments/conditionals inside SVG (Satori limitation).
export function ResolutionIcon({
  status,
  scale = 1,
  compact = false,
}: {
  status: ResolutionStatus;
  scale?: number;
  compact?: boolean;
}) {
  const size = Math.round((compact ? 28 : 34) * scale);
  const color =
    status === 'correct'
      ? og.colors.success
      : status === 'incorrect'
        ? og.colors.danger
        : og.colors.foregroundLight;
  const bgColor = toRgba(color, 0.2);
  const svgStyle: React.CSSProperties = {
    display: 'flex',
    flexShrink: 0,
    marginRight: (compact ? 10 : 14) * scale,
  };

  if (status === 'correct') {
    const sw = Math.max(1, 1.5 * scale);
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" style={svgStyle}>
        <circle cx="14" cy="14" r="13" fill={bgColor} />
        <path
          d="M9 14.5L12.5 18L19 10.5"
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === 'incorrect') {
    const sw = Math.max(1, 1.5 * scale);
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" style={svgStyle}>
        <circle cx="14" cy="14" r="13" fill={bgColor} />
        <path
          d="M10.5 10.5L17.5 17.5M17.5 10.5L10.5 17.5"
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // pending — clock icon, neutral foreground to match COMING SOON badge style
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" style={svgStyle}>
      <circle cx="14" cy="14" r="13" fill={bgColor} />
      <circle
        cx="14"
        cy="14"
        r="5.75"
        fill="none"
        stroke={color}
        strokeWidth="1"
      />
      <path
        d="M14 10.75V14.25L16.5 16"
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { og };
