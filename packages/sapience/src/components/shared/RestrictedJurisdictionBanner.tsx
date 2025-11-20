import { OctagonMinusIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@sapience/sdk/ui/components/ui/alert';

type RestrictedJurisdictionBannerProps = {
  show: boolean;
  className?: string;
  /**
   * Optional override for the icon size/styling in more compact layouts.
   * Defaults to a larger icon suitable for full-width banners.
   */
  iconClassName?: string;
};

/**
 * Standard banner shown when the user is accessing from a restricted jurisdiction.
 *
 * Callers are responsible for deciding when `show` should be true
 * (typically when `isRestricted` from `useRestrictedJurisdiction` is true).
 */
const RestrictedJurisdictionBanner: React.FC<
  RestrictedJurisdictionBannerProps
> = ({ show, className, iconClassName }) => {
  if (!show) return null;

  const iconClasses = iconClassName ?? 'h-8 w-8';

  return (
    <Alert
      variant="destructive"
      className={`border-no/40 bg-no/10 text-no rounded px-3.5 py-3 ${className ?? ''}`}
    >
      <AlertDescription className="text-left font-mono text-xs flex flex-row items-center gap-2.5">
        <OctagonMinusIcon
          className={`${iconClasses} !text-no`}
          strokeWidth={1.2}
          aria-hidden="true"
        />
        You cannot access this app from a restricted jurisdiction.
      </AlertDescription>
    </Alert>
  );
};

export default RestrictedJurisdictionBanner;
