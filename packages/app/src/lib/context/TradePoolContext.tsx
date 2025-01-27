import type React from 'react';
import { createContext, useContext, useState } from 'react';

// Helper functions for price/tick conversion
const tickToPrice = (tick: number): number => 1.0001 ** tick;
const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

interface TradePoolContextType {
  tradeDirection: 'Long' | 'Short' | null;
  setTradeDirection: (direction: 'Long' | 'Short' | null) => void;
  lowPriceTick: number;
  setLowPriceTick: (tick: number) => void;
  highPriceTick: number;
  setHighPriceTick: (tick: number) => void;
  snapPriceToTick: (
    price: number,
    tickSpacing: number
  ) => { tick: number; price: number };
}

const TradePoolContext = createContext<TradePoolContextType | undefined>(
  undefined
);

interface TradePoolProviderProps {
  children: React.ReactNode;
  isTrade?: boolean;
}

export const TradePoolProvider: React.FC<TradePoolProviderProps> = ({
  children,
  isTrade = false,
}) => {
  const [tradeDirection, setTradeDirection] = useState<'Long' | 'Short' | null>(
    isTrade ? 'Long' : null
  );
  const [lowPriceTick, setLowPriceTick] = useState<number>(0);
  const [highPriceTick, setHighPriceTick] = useState<number>(0);

  const snapPriceToTick = (price: number, tickSpacing: number) => {
    const nearestTick = priceToTick(price, tickSpacing);
    const snappedPrice = tickToPrice(nearestTick);
    return { tick: nearestTick, price: snappedPrice };
  };

  return (
    <TradePoolContext.Provider
      value={{
        tradeDirection,
        setTradeDirection,
        lowPriceTick,
        setLowPriceTick,
        highPriceTick,
        setHighPriceTick,
        snapPriceToTick,
      }}
    >
      {children}
    </TradePoolContext.Provider>
  );
};

export const useTradePool = () => {
  const context = useContext(TradePoolContext);
  if (context === undefined) {
    throw new Error('useTradePool must be used within a TradePoolProvider');
  }
  return context;
};
