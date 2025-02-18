import { Check, Loader2, Minus } from 'lucide-react';
import type React from 'react';

import type { PublicCellProps } from './types';

const PublicCell: React.FC<PublicCellProps> = ({
  isPublic,
  market,
  loading,
  onUpdate,
}) => (
  <div className="flex items-center gap-2">
    {isPublic ? (
      <Check className="h-4 w-4 text-green-500" />
    ) : (
      <Minus className="h-4 w-4 text-gray-400" />
    )}
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
  </div>
);

export default PublicCell;
