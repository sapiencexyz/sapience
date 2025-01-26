import type React from 'react';
import { createContext, useContext, useState } from 'react';

interface TradePoolContextType {
  tradeDirection: 'Long' | 'Short' | null;
  setTradeDirection: (direction: 'Long' | 'Short' | null) => void;
  lowPrice: number;
  setLowPrice: (price: number) => void;
  highPrice: number;
  setHighPrice: (price: number) => void;
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
  const [lowPrice, setLowPrice] = useState<number>(0);
  const [highPrice, setHighPrice] = useState<number>(0);

  return (
    <TradePoolContext.Provider
      value={{
        tradeDirection,
        setTradeDirection,
        lowPrice,
        setLowPrice,
        highPrice,
        setHighPrice,
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
