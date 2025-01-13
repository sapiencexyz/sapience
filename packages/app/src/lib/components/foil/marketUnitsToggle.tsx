import type React from "react";
import { useContext } from "react";
import { BsArrowLeftRight } from "react-icons/bs";

import { MarketContext } from "../../context/MarketProvider";
import { Button } from "@/components/ui/button";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MarketUnitsToggle: React.FC = () => {
  const { useMarketUnits, setUseMarketUnits } = useContext(MarketContext);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="mr-3"
            onClick={() => setUseMarketUnits(!useMarketUnits)}
          >
            <BsArrowLeftRight className="h-4 w-4" />
            <span className="sr-only">Toggle Units</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Toggle units</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MarketUnitsToggle;
