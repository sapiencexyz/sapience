import { ImageResponse } from 'next/og';
import { formatDistanceStrict } from 'date-fns';
import { fetchAttestationByUid, d18ToPercentage } from '../_forecast-helpers';
import {
  og,
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
  ForecastFooter,
  SectionLabel,
  FONT_FAMILY,
  createErrorImageResponse,
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

    // Local helpers to format dates without external deps
    const formatShortDate = (tsSec: number): string => {
      if (!Number.isFinite(tsSec) || tsSec <= 0) return '';
      const d = new Date(Math.floor(tsSec) * 1000);
      try {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(d);
      } catch {
        return d.toISOString().slice(0, 10);
      }
    };

    const formatHorizonDays = (fromTsSec: number, toTsSec: number): string => {
      if (!Number.isFinite(fromTsSec) || !Number.isFinite(toTsSec)) return '';
      if (fromTsSec <= 0 || toTsSec <= 0) return '';
      const from = new Date(Math.floor(fromTsSec) * 1000);
      const to = new Date(Math.floor(toTsSec) * 1000);
      const diffMs = Math.abs(+to - +from);
      const dayMs = 24 * 60 * 60 * 1000;
      if (diffMs < dayMs) {
        try {
          return formatDistanceStrict(from, to);
        } catch {
          const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
          return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
        }
      }
      const days = Math.max(1, Math.round(diffMs / dayMs));
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    };

    // If uid is provided, fetch attestation data from GraphQL API
    const uidParam = searchParams.get('uid');
    let question =
      normalizeText(searchParams.get('q'), 160) || 'Forecast on Sapience';
    let endTs = Number(searchParams.get('end') || '');
    let createdTs = Number(searchParams.get('created') || '');
    const resolutionParam = normalizeText(searchParams.get('res'), 48);
    const horizonParam = normalizeText(searchParams.get('hor'), 48);
    let oddsRaw = normalizeText(searchParams.get('odds'), 8);
    if (uidParam) {
      const attestation = await fetchAttestationByUid(uidParam).catch(
        () => null
      );
      if (attestation) {
        question =
          normalizeText(attestation.condition?.question ?? null, 160) ||
          question;
        createdTs = attestation.time || createdTs;
        if (attestation.condition?.endTime) {
          endTs = attestation.condition.endTime;
        }
        if (attestation.prediction) {
          try {
            const pct = Math.round(d18ToPercentage(attestation.prediction));
            oddsRaw = `${pct}`;
          } catch {
            // keep existing oddsRaw
          }
        }
      }
    }

    const odds = oddsRaw ? `${oddsRaw.replace(/%/g, '')}%` : '';

    // Prefer server-side computed values when timestamps are provided
    const resolution = endTs ? formatShortDate(endTs) : resolutionParam;
    const horizon =
      endTs && createdTs ? formatHorizonDays(createdTs, endTs) : horizonParam;

    const { bgUrl } = commonAssets(req);
    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);

    const imageResponse = new ImageResponse(
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
                <SectionLabel scale={scale}>Question</SectionLabel>
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
                      fontWeight: 600,
                      letterSpacing: -0.16 * scale,
                      color: og.colors.brandWhite,
                      fontFamily: FONT_FAMILY.mono,
                    }}
                  >
                    {question}
                  </div>
                </div>
              </div>
            </div>

            <ForecastFooter
              resolution={resolution}
              horizon={horizon}
              odds={odds}
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

    imageResponse.headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200'
    );

    return imageResponse;
  } catch (err) {
    return createErrorImageResponse(err);
  }
}
