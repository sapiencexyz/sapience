import Loader from '~/components/shared/Loader';

/**
 * Shared "Loading …" state for the profile-tab tables (Positions /
 * Forecasts / Activity). Pairs a small inline spinner with a font-mono
 * uppercase message.
 *
 * When `fill` is set, the box grows via `flex-1` to fill its parent
 * flex column. The caller is responsible for setting up the flex
 * ancestor chain (page wrapper + bordered container both `flex flex-col
 * flex-1`). Omit `fill` for compact (py-12) rendering inside dialogs
 * and embedded contexts.
 */
export default function TableLoadingState({
  message,
  fill = false,
}: {
  message: string;
  fill?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${
        fill ? 'flex-1' : 'py-12'
      }`}
    >
      <Loader className="w-3 h-3" />
      <span className="text-sm text-muted-foreground font-mono uppercase">
        {message}
      </span>
    </div>
  );
}
