/* eslint-disable new-cap */
/* eslint-disable no-new */
import { useTheme } from 'next-themes';
import type React from 'react';
import { useContext, useEffect, useRef, useState } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';
import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { API_BASE_URL } from '~/lib/constants/constants';

// Declare a construct signature for TradingView.widget
declare global {
  interface TradingViewWidget {
    new (config: any): any;
  }

  interface Window {
    TradingView?: {
      widget: TradingViewWidget;
    };
  }
}

let tvScriptLoadingPromise: Promise<void> | undefined;

const TradingViewWidget: React.FC = () => {
  const { theme } = useTheme();
  const onLoadScriptRef = useRef<null | (() => void)>(null);
  const widgetRef = useRef<any>(null);

  const {
    address: marketAddress,
    collateralAssetTicker,
    epoch,
    chainId
  } = useContext(MarketContext);

  const createDatafeed = () => {
    return {
      onReady: (callback: (config: any) => void) => {
        console.log('onReady called');
        setTimeout(() =>
          callback({
            supported_resolutions: ['1', '5', '15', '30', '60', '240', 'D', 'W'],
            supports_search: true,
            supports_group_request: false,
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
            exchanges: [
              { value: 'FOIL', name: 'FOIL', desc: 'FOIL Markets' }
            ],
            symbols_types: [
              { name: 'crypto', value: 'crypto' }
            ]
          })
        );
      },

      searchSymbols: (
        userInput: string,
        exchange: string,
        symbolType: string,
        onResult: (result: any[]) => void
      ) => {
        console.log('searchSymbols called', { userInput, exchange, symbolType });
        const symbol = `FOIL:${chainId}:${marketAddress}:${epoch}`;
        onResult([
          {
            symbol,
            full_name: symbol,
            description: `FOIL Market ${epoch}`,
            exchange: 'FOIL',
            type: 'crypto'
          }
        ]);
      },

      getBars: async (
        symbolInfo: any,
        resolution: string,
        periodParams: {
          from: number;
          to: number;
          firstDataRequest: boolean;
          countBack?: number;
        },
        onHistoryCallback: (
          bars: PriceChartData[],
          meta: { noData?: boolean }
        ) => void,
        onErrorCallback: (error: string) => void
      ) => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/prices/trading-view?` +
            `from=${periodParams.from}&` +
            `to=${periodParams.to}&` +
            `interval=${resolution}&` +
            `contractId=${symbolInfo.ticker}`
          );

          if (!response.ok) {
            throw new Error('Failed to fetch market data');
          }

          const data: PriceChartData[] = await response.json();

          if (!data || data.length === 0) {
            onHistoryCallback([], { noData: true });
            return;
          }

          const bars = data.map((bar) => ({
            time: bar.startTimestamp * 1000,
            open: parseFloat(bar.open),
            high: parseFloat(bar.high),
            low: parseFloat(bar.low),
            close: parseFloat(bar.close),
            volume: parseFloat(bar.volume || '0')
          }));

          onHistoryCallback(bars, { noData: false });
        } catch (error) {
          console.error('Error in getBars:', error);
          onErrorCallback((error as Error).message);
        }
      },

      subscribeBars: (
        symbolInfo: any,
        resolution: string,
        onRealtimeCallback: (bar: PriceChartData) => void
      ) => {
        // Implement real-time updates if needed
        // You could use WebSocket here to receive live updates
      },

      unsubscribeBars: () => {
        // Cleanup any real-time subscriptions
      },

      resolveSymbol: (
        symbolName: string,
        onSymbolResolvedCallback: (symbolInfo: any) => void,
        onResolveErrorCallback: (error: string) => void
      ) => {
        console.log('resolveSymbol called', symbolName);
        
        const symbol = `FOIL:${chainId}:${marketAddress}:${epoch}`;
        
        // Always resolve the current market symbol
        if (symbolName === symbol) {
          const symbolInfo = {
            ticker: symbol,
            name: symbol,
            full_name: symbol,
            description: `FOIL Market ${epoch}`,
            type: 'crypto',
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: 'FOIL',
            listed_exchange: 'FOIL',
            minmov: 1,
            pricescale: 100, // Adjust this based on your price precision
            has_intraday: true,
            has_daily: true,
            has_weekly_and_monthly: true,
            supported_resolutions: ['1', '5', '15', '30', '60', '240', 'D', 'W'],
            volume_precision: 2,
            data_status: 'streaming',
          };
          
          console.log('Symbol resolved:', symbolInfo);
          onSymbolResolvedCallback(symbolInfo);
        } else {
          console.log('Symbol resolution failed');
          onResolveErrorCallback('invalid_symbol');
        }
      },
    };
  };

  useEffect(() => {
    const cleanupWidget = () => {
      if (widgetRef.current) {
        const container = document.getElementById('tradingview_c10e9');
        if (container) {
          container.innerHTML = '';
        }
        widgetRef.current = null;
      }
    };

    function createWidget() {
      if (document.getElementById('tradingview_c10e9') && window.TradingView) {
        cleanupWidget();
        
        const symbol = `FOIL:${chainId}:${marketAddress}:${epoch}`;
        console.log('Creating widget with symbol:', symbol);
        
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol,
          interval: '15',
          timezone: 'Etc/UTC',
          theme: theme === 'dark' ? 'dark' : 'light',
          style: '1',
          locale: 'en',
          enable_publishing: false,
          withdateranges: true,
          hide_drawing_toolbar: true,
          container_id: 'tradingview_c10e9',
          library_path: '/charting_library/',
          client_id: 'tradingview.com',
          user_id: 'public_user_id',
          datafeed: createDatafeed(),
          disabled_features: ['use_localstorage_for_settings'],
          enabled_features: ['study_templates'],
          overrides: {
            "mainSeriesProperties.style": 1,
            "symbolWatermarkProperties.color": "#944",
            "volumePaneSize": "medium"
          }
        });
      }
    }

    onLoadScriptRef.current = createWidget;

    if (!tvScriptLoadingPromise) {
      tvScriptLoadingPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.id = 'tradingview-widget-loading-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.type = 'text/javascript';
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    }

    tvScriptLoadingPromise.then(() => {
      if (onLoadScriptRef.current) onLoadScriptRef.current();
    });

    return () => {
      cleanupWidget();
      onLoadScriptRef.current = null;
    };
  }, [marketAddress, epoch, chainId, theme]);

  return (
    <div
      className="tradingview-widget-container"
      style={{ height: '100%', width: '100%' }}
    >
      <div
        id="tradingview_c10e9"
        style={{ height: 'calc(100% - 32px)', width: '100%' }}
      />
    </div>
  );
};

export default TradingViewWidget;
