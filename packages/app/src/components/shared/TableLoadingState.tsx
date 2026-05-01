import Loader from '~/components/shared/Loader';

/**
 * Shared "Loading …" state for the profile-tab tables (Positions /
 * Forecasts / Activity). Pairs a small inline spinner with a font-mono
 * uppercase message and (optionally) stretches to fill the remaining
 * viewport height — accounting for the page header, profile section,
 * tabs row, and footer chrome.
 */
export default function TableLoadingState({
  message,
  fillViewport = false,
}: {
  message: string;
  fillViewport?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${
        fillViewport ? 'min-h-[calc(100svh-340px)]' : 'py-12'
      }`}
    >
      <Loader className="w-3 h-3" />
      <span className="text-sm text-muted-foreground font-mono uppercase">
        {message}
      </span>
    </div>
  );
}
