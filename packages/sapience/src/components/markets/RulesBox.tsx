'use client';

import SafeMarkdown from '~/components/shared/SafeMarkdown';

interface RulesBoxProps {
  text?: string | null;
  collapsedMaxHeight?: number; // in px
  className?: string;
  forceExpanded?: boolean;
}

// Collapsible text container with gradient fade and animated expand/collapse
const RulesBox = ({ text, className }: RulesBoxProps) => {
  const resolvedText = (text || '').trim();
  const isEmpty = resolvedText.length === 0;

  return (
    <div className={className}>
      <div className="bg-background dark:bg-muted/50 border border-border rounded shadow-sm p-0">
        <div className="relative">
          <div className="p-4">
            <div className="text-sm text-muted-foreground">
              {isEmpty ? (
                'No additional rules clarification provided.'
              ) : (
                <SafeMarkdown content={resolvedText} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RulesBox;
