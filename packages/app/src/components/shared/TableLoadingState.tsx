import Loader from '~/components/shared/Loader';

/**
 * Shared "Loading …" state for the profile-tab tables (Positions /
 * Forecasts / Activity). Pairs a small inline spinner with a font-mono
 * uppercase message and (optionally) stretches to `100svh -
 * viewportOffset` so the panel covers the visible page area.
 *
 * `viewportOffset` is per-consumer because the chrome above each
 * consumer differs (profile ~340, /feed ~200). Omit it for compact
 * (py-12) rendering inside dialogs and embedded contexts.
 */
export default function TableLoadingState({
  message,
  viewportOffset,
}: {
  message: string;
  viewportOffset?: number;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${
        viewportOffset !== undefined ? '' : 'py-12'
      }`}
      style={
        viewportOffset !== undefined
          ? { minHeight: `calc(100svh - ${viewportOffset}px)` }
          : undefined
      }
    >
      <Loader className="w-3 h-3" />
      <span className="text-sm text-muted-foreground font-mono uppercase">
        {message}
      </span>
    </div>
  );
}
