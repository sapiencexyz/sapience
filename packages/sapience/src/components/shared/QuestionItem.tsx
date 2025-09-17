'use client';

interface QuestionItemProps {
  item: any; // Can be a market or market group
  onClick: (item: any) => void;
  isSelected?: boolean;
  showBorder?: boolean;
  className?: string;
}

const QuestionItem = ({
  item,
  onClick,
  isSelected = false,
  showBorder = true,
  className = '',
}: QuestionItemProps) => {
  // Determine if this is a market group or individual market
  const isMarketGroup = !item.marketId && !item.optionName;

  // Get the display title - focus on market question
  const getTitle = () => {
    if (isMarketGroup) {
      return item.question;
    }

    // For individual markets, always show the market question
    return (
      item.question ||
      item.optionName ||
      item.group?.question ||
      `Market ${item.marketId}`
    );
  };

  // Get category color for the left border
  const getCategoryColor = () => {
    if (isMarketGroup) {
      return item.category?.color || '#9CA3AF';
    }

    // For individual markets, get from group
    return item.group?.category?.color || '#9CA3AF';
  };

  const categoryColor = getCategoryColor();
  const borderClass = showBorder ? 'border-b border-border' : '';
  const selectedClass = isSelected ? 'bg-primary/10' : '';

  return (
    <div className={`w-full ${borderClass}`}>
      <button
        type="button"
        className={`w-full bg-card border-muted flex flex-row transition-colors items-stretch min-h-[48px] relative hover:bg-muted/50 ${selectedClass} ${className}`}
        onClick={() => onClick(item)}
      >
        {/* Colored Bar (Full Height) */}
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: categoryColor, margin: '-1px 0' }}
        />

        {/* Content Container */}
        <div className="flex-grow px-4 py-3">
          <div className="text-left">
            <div className="font-medium text-foreground">{getTitle()}</div>
          </div>
        </div>
      </button>
    </div>
  );
};

export default QuestionItem;
