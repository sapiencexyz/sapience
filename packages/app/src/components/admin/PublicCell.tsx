import { Loader2 } from 'lucide-react';
import type React from 'react';

import { Switch } from '@/components/ui/switch';

import type { PublicCellProps } from './types';

const PublicCell: React.FC<PublicCellProps> = ({
  isPublic,
  market,
  loading,
  onUpdate,
  epochId,
}) => (
  <div className="flex items-center gap-2">
    <Switch
      checked={isPublic}
      onCheckedChange={() => onUpdate(market, epochId)}
      disabled={loading}
      aria-label="Toggle market public status"
    />
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
  </div>
);

export default PublicCell;
