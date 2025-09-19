export const WIDTH = 1200;
export const HEIGHT = 630;

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

export function Background({ bgUrl }: { bgUrl: string }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: -48,
        right: -48,
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
          opacity: 0.75,
        }}
      />
    </div>
  );
}

export function Header({ logoUrl }: { logoUrl: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <img
        src={logoUrl}
        alt="Sapience"
        width={264}
        height={59}
        style={{ display: 'flex', width: 264, height: 59 }}
      />
    </div>
  );
}

export function Footer({ addr }: { addr: string }) {
  return (
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
        <div style={{ display: 'flex', opacity: 0.85, fontWeight: 500 }}>
          www.sapience.xyz
        </div>
      </div>
    </div>
  );
}

export const baseContainerStyle: React.CSSProperties = {
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
};

// Typography primitives
export function H1({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 40,
        lineHeight: 1.25,
        fontWeight: 700,
        letterSpacing: -0.5,
        opacity: 0.95,
      }}
    >
      {children}
    </div>
  );
}

export function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 18,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: 0.6,
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
    success: { bg: 'rgba(16,185,129,0.12)', fg: '#0FAF86', border: '#10B981' },
    danger: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444', border: '#EF4444' },
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
}: {
  text: string;
  tone?: PillTone;
}) {
  const t = pillTones[tone];
  return (
    <div
      style={{
        display: 'flex',
        padding: '6px 14px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontWeight: 700,
        border: `2px solid ${t.border}`,
        letterSpacing: 0.5,
        fontSize: 18,
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
}: {
  wager?: string | null;
  payout?: string | null;
  symbol?: string | null;
}) {
  const hasWager = Boolean(wager);
  const hasPayout = Boolean(payout);
  if (!hasWager && !hasPayout) return null;
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 420 }}
    >
      {hasWager ? (
        <div
          style={{
            display: 'flex',
            fontSize: 24,
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
            gap: 12,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              fontSize: 68,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: -0.8,
            }}
          >
            {payout}
          </div>
          {symbol ? (
            <div style={{ fontSize: 26, opacity: 0.9, fontWeight: 600 }}>
              {symbol}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
