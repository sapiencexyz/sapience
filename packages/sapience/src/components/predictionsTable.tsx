'use client';

import { format, formatDistance, formatDistanceToNow } from 'date-fns';
import { FrownIcon, ArrowRight, ClockIcon, CheckCircleIcon, ScaleIcon, BarChart2Icon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { DEFAULT_FOCUS_AREA, FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useResources } from '~/lib/hooks/useResources';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

// Buy Position Dialog Component
interface BuyPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: 'yes' | 'no' | null;
  question: string;
  marketName: string;
  yesProb: number;
  noProb: number;
  color: string;
}

const BuyPositionDialog = ({ 
  open, 
  onOpenChange, 
  position, 
  question, 
  marketName, 
  yesProb, 
  noProb, 
  color 
}: BuyPositionDialogProps) => {
  const [predictionValue, setPredictionValue] = React.useState('');
  const [amountValue, setAmountValue] = React.useState('');
  
  // Extract the unit from the question (e.g., "gwei", "°C", "$", etc.)
  const getUnit = () => {
    if (marketName.toLowerCase().includes('gas')) {
      return 'gwei';
    } else if (marketName.toLowerCase().includes('temperature')) {
      return '°C';
    } else if (marketName.toLowerCase().includes('price') || marketName.toLowerCase().includes('cost')) {
      return '$';
    } else {
      return 'units';
    }
  };
  
  const unit = getUnit();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[350px]">
        <div className="mb-2">
          <p className="font-medium">{question}</p>
        </div>
        
        <div>
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">I think it will be {position === 'yes' ? 'at least' : 'at most'}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={predictionValue}
                onChange={(e) => setPredictionValue(e.target.value)}
                placeholder="Enter value"
                className="w-full"
              />
              <span className="text-sm">{unit}</span>
            </div>
          </div>
          
          <div className="mb-2">
            <p className="mb-2 text-sm font-medium flex items-center">
              Amount of sUSDe
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-600 w-4 h-4 text-xs cursor-help">?</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px]">
                    <p>sUSDe is a stablecoin used for prediction markets. It's pegged to the US dollar and used to buy positions.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={amountValue}
                onChange={(e) => setAmountValue(e.target.value)}
                placeholder="Enter amount"
                className="w-full"
              />
              <span className="text-sm">sUSDe</span>
            </div>
          </div>
        </div>
        
        <div className="mt-2">
          <Button 
            className="w-full py-6 text-lg font-medium"
            style={{ backgroundColor: color, borderColor: color }}
            onClick={() => {
              // Handle position purchase
              onOpenChange(false);
            }}
          >
            Create Prediction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Create a component to render the SVG icon from the iconSvg string
const FocusAreaIcon = ({ iconSvg, color }: { iconSvg: string; color: string }) => (
  <div 
    className="rounded-full p-2 w-8 h-8 flex items-center justify-center"
    style={{ backgroundColor: `${color}25` }} // Using 25% opacity version of the color
  >
    <div 
      className="w-4 h-4 flex items-center justify-center"
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  </div>
);

// New PredictionPreview component
interface PredictionPreviewProps {
  marketName: string;
  iconPath: string;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
  chainId: number;
  marketAddress: string;
  epochId: number;
  color: string;
}

const PredictionPreview = ({
  marketName,
  iconPath,
  startTimestamp,
  endTimestamp,
  settled,
  chainId,
  marketAddress,
  epochId,
  color,
}: PredictionPreviewProps) => {
  const now = Math.floor(Date.now() / 1000);
  let status = '';
  let statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [position, setPosition] = React.useState<'yes' | 'no' | null>(null);

  if (now < startTimestamp) {
    status = 'Upcoming';
    statusVariant = 'secondary';
  } else if (now >= startTimestamp && now <= endTimestamp) {
    status = 'Active';
    statusVariant = 'default';
  } else if (now > endTimestamp && !settled) {
    status = 'Settling';
    statusVariant = 'destructive';
  } else {
    status = 'Settled';
    statusVariant = 'outline';
  }

  // Format dates for display
  const startDate = new Date(startTimestamp * 1000);
  const endDate = new Date(endTimestamp * 1000);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = monthNames[endDate.getMonth()];
  const year = endDate.getFullYear();
  
  // Generate a random probability for demo purposes
  const probability = Math.floor(Math.random() * 100);
  const yesProb = probability;
  
  // Generate random threshold values based on the market type
  const getThresholdValue = () => {
    // Generate different thresholds based on market type
    if (marketName.toLowerCase().includes('gas')) {
      return `${(Math.random() * 10).toFixed(2)} gwei`;
    } else if (marketName.toLowerCase().includes('temperature')) {
      return `${(Math.random() * 5 + 30).toFixed(1)}°C`;
    } else if (marketName.toLowerCase().includes('price') || marketName.toLowerCase().includes('cost')) {
      return `$${(Math.random() * 1000 + 100).toFixed(2)}`;
    } else {
      return `${(Math.random() * 100).toFixed(2)} units`;
    }
  };
  
  const threshold = getThresholdValue();
  
  // Generate a yes/no question based on the market name
  const question = `Will the average cost of ${marketName} in ${month} ${year} exceed ${threshold}?`;

  // Calculate the no probability
  const noProb = 100 - yesProb;

  return (
    <Card className="overflow-hidden border-t-[6px]" style={{ borderTopColor: color }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 border-b border-gray-100 bg-gray-50/30">
        {/* Left side - Probability gauge (1/3 width) */}
        <div className="p-6 pb-0 flex flex-col items-center justify-center">
          {/* Gauge container with relative positioning */}
          <div className="relative w-full flex flex-col items-center">
            {/* Half circle gauge - wider */}
            <div className="w-full max-w-[200px]">
              <svg width="100%" viewBox="0 0 100 55" preserveAspectRatio="xMidYMid meet">
                {/* Background half circle */}
                <path 
                  d="M 5 50 A 45 45 0 0 1 95 50" 
                  fill="none" 
                  stroke="#f0f0f0" 
                  strokeWidth="4"
                  strokeLinecap="round" 
                />
                {/* Colored progress half circle */}
                <path 
                  d="M 5 50 A 45 45 0 0 1 95 50" 
                  fill="none" 
                  stroke={color}
                  strokeWidth="4" 
                  strokeDasharray={`${yesProb * 1.41} 141`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            
            {/* Percentage - positioned to overlap the bottom of the arc */}
            <div className="absolute top-[28px] left-0 right-0 flex flex-col items-center">
              <span style={{ 
                fontSize: "36px", 
                fontWeight: "500",
                letterSpacing: "-0.5px",
                borderRadius: "999px",
                padding: "0 8px"
              }}>
                {yesProb}%
              </span>
              <span className="text-gray-500 text-sm mt-0">Chance</span>
            </div>
          </div>
        </div>

        {/* Right side - Price chart (2/3 width) */}
        <div className="p-6 pb-0 flex flex-col md:col-span-2">
          <div className="h-32 w-full relative">
            {/* Simplified chart representation */}
            <div className="absolute inset-0 flex items-end">
              <div className="w-full h-full relative overflow-hidden">
                <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none">
                  {/* Define gradient */}
                  <defs>
                    <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                      <stop offset="100%" stopColor={color} stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  
                  {/* Area fill with gradient */}
                  <path 
                    d="M0,35 C10,32 20,25 30,28 C40,31 50,20 60,15 C70,10 80,5 90,8 L100,5 L100,40 L0,40 Z" 
                    fill="url(#chartGradient)" 
                  />
                  
                  {/* Line with smaller stroke */}
                  <path 
                    d="M0,35 C10,32 20,25 30,28 C40,31 50,20 60,15 C70,10 80,5 90,8 L100,5" 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="1" 
                  />
                </svg>
              </div>
            </div>
          </div>
          
          <div className="mt-auto">
            {/* Removed market badge and liquidity badge */}
          </div>
        </div>
      </div>
      
      {/* Question and buttons */}
      <div className="px-6 py-6 rounded-md">
        <h3 className="text-2xl md:text-3xl font-medium mb-6 text-left leading-tight">{question}</h3>
        <div className="grid grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            className="w-full py-6 text-lg font-medium" 
            style={{ borderColor: color, color: color }}
            onClick={() => {
              setPosition('yes');
              setDialogOpen(true);
            }}
          >
            Predict Yes
          </Button>
          <Button 
            variant="outline" 
            className="w-full py-6 text-lg font-medium" 
            style={{ borderColor: color, color: color }}
            onClick={() => {
              setPosition('no');
              setDialogOpen(true);
            }}
          >
            Predict No
          </Button>
        </div>
      </div>
      
      {/* Footer with detailed information */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-lg">
        <div className="flex flex-col sm:flex-row flex-wrap justify-between items-start sm:items-center gap-4 text-sm">
          <div className="flex items-center text-gray-500">
            {!settled && (
              <div className="flex items-center">
                <ClockIcon className="h-4 w-4 mr-1" />
                <span>Closes in {formatDistanceToNow(new Date(endTimestamp * 1000))}</span>
              </div>
            )}
            {settled && (
              <div className="flex items-center">
                <CheckCircleIcon className="h-4 w-4 mr-1" />
                <span>Closed {formatDistance(new Date(endTimestamp * 1000), new Date(), { addSuffix: true })}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center text-gray-500">
            <ScaleIcon className="h-4 w-4 mr-1" />
            <span>Liquidity: 1.2M wstETH</span>
          </div>
          
          <div className="flex items-center text-gray-500">
            <BarChart2Icon className="h-4 w-4 mr-1" />
            <span>Volume: 450K wstETH</span>
          </div>
          
          <div className="flex items-center text-gray-500">
            <span className="flex items-center">
              {/* Farcaster icon */}
              <svg className="h-4 w-4 mr-1" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z" fill="currentColor"/>
                <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" fill="currentColor"/>
                <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" fill="currentColor"/>
              </svg>
              <span>Channel: {marketName.toLowerCase().replace(/\s+/g, '-')}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Buy Position Dialog */}
      <BuyPositionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={position}
        question={question}
        marketName={marketName}
        yesProb={yesProb}
        noProb={noProb}
        color={color}
      />
    </Card>
  );
};

const PredictionsTable = () => {
  const { data: resources } = useResources();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get the focus area from the URL query parameter, or use the default
  const focusParam = searchParams.get('focus');
  const [selectedFocusArea, setSelectedFocusArea] = React.useState(
    focusParam && FOCUS_AREAS.some(area => area.id === focusParam) 
      ? focusParam 
      : DEFAULT_FOCUS_AREA.id
  );

  // Add state for the active/settled toggle
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'settled'>('active');

  // Update the state when the URL parameter changes
  React.useEffect(() => {
    if (focusParam && FOCUS_AREAS.some(area => area.id === focusParam)) {
      setSelectedFocusArea(focusParam);
    }
  }, [focusParam]);

  const data = React.useMemo(
    () =>
      resources?.flatMap((resource) =>
        resource.markets
          .filter(() => {
            // Filter by focus area
            const focusArea = FOCUS_AREAS.find(area => area.id === selectedFocusArea);
            return focusArea ? focusArea.resources.includes(resource.slug) : true;
          })
          .flatMap((market) =>
            market.epochs
              .filter((epoch) => {
                // Filter by public status
                if (!epoch.public) return false;
                
                // Filter by active/settled status
                const now = Math.floor(Date.now() / 1000);
                if (statusFilter === 'active') {
                  return now <= epoch.endTimestamp || (now > epoch.endTimestamp && !epoch.settled);
                } else if (statusFilter === 'settled') {
                  return epoch.settled;
                }
                return true; // 'all' filter
              })
              .map((epoch) => {
                const startDate = new Date(epoch.startTimestamp * 1000);
                const endDate = new Date(epoch.endTimestamp * 1000);
                return {
                  marketName: resource.name,
                  iconPath: resource.iconPath,
                  epochId: epoch.epochId,
                  period: `${format(startDate, 'PPpp')} → ${format(
                    endDate,
                    'PPpp'
                  )}`,
                  startTimestamp: epoch.startTimestamp,
                  endTimestamp: epoch.endTimestamp,
                  chainId: market.chainId,
                  marketAddress: market.address,
                  settled: epoch.settled,
                };
              })
          )
      ) ?? [],
    [resources, selectedFocusArea, statusFilter]
  );

  const handleFocusAreaClick = (focusAreaId: string) => {
    setSelectedFocusArea(focusAreaId);
    
    // Update the URL with the selected focus area
    const params = new URLSearchParams(searchParams);
    params.set('focus', focusAreaId);
    router.push(`/predictions?${params.toString()}`);
  };

  return (
    <div className="flex">
      {/* Left Sidebar */}
      <div className="w-80 pr-8 border-r">
        <h3 className="font-medium text-lg mb-6">Focus Areas</h3>
        <div className="space-y-4">
          {FOCUS_AREAS.map((area) => (
            <button
              key={area.id}
              onClick={() => handleFocusAreaClick(area.id)}
              className={`w-full text-left px-4 py-3 rounded-md flex items-center gap-3 transition-colors ${
                selectedFocusArea === area.id
                  ? 'bg-secondary'
                  : 'hover:bg-secondary/50'
              }`}
            >
              <FocusAreaIcon iconSvg={area.iconSvg} color={area.color} />
              <span className="font-medium">{area.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 mb-8">
          <h3 className="font-medium text-lg mb-4">Status</h3>
          <Tabs 
            defaultValue="active" 
            value={statusFilter} 
            onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'settled')}
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="settled">Settled</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 pl-8">
        {data.length === 0 ? (
          <div className="w-full py-24 text-center text-muted-foreground">
            <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
            No predictions available
          </div>
        ) : (
          <div className="space-y-6">
            {data.map((item, index) => {
              // Find the focus area color for this item
              const focusArea = FOCUS_AREAS.find(area => 
                area.id === selectedFocusArea && 
                area.resources.includes(item.marketName.toLowerCase().replace(/\s+/g, '-'))
              ) || FOCUS_AREAS.find(area => area.id === selectedFocusArea);
              
              const color = focusArea?.color || DEFAULT_FOCUS_AREA.color;
              
              return (
                <PredictionPreview
                  key={`${item.chainId}:${item.marketAddress}:${item.epochId}`}
                  marketName={item.marketName}
                  iconPath={item.iconPath}
                  startTimestamp={item.startTimestamp}
                  endTimestamp={item.endTimestamp}
                  settled={item.settled}
                  chainId={item.chainId}
                  marketAddress={item.marketAddress}
                  epochId={item.epochId}
                  color={color}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictionsTable; 