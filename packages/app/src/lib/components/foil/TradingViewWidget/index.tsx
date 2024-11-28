/* eslint-disable new-cap */
/* eslint-disable no-new */
import { useTheme } from 'next-themes';
import type React from 'react';
import { useContext, useEffect, useRef, useState } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';
import type { PriceChartData } from '~/lib/interfaces/interfaces';

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
  } = useContext(MarketContext);

  const createDatafeed = () => {
    return {
      onReady: (callback: (config: any) => void) => {
        setTimeout(() =>
          callback({
            supported_resolutions: [
              '1',
              '5',
              '15',
              '30',
              '60',
              '1D',
              '1W',
              '1M',
            ],
            supports_time: true,
            supports_marks: false,
            supports_timescale_marks: false,
          })
        );
      },
      searchSymbols: (
        userInput: string,
        exchange: string,
        symbolType: string,
        onResult: (result: any[]) => void
      ) => {
        // Return the market as the only searchable symbol
        onResult([
          {
            symbol: marketAddress,
            full_name: marketAddress,
            description: collateralAssetTicker || 'Market',
            exchange: 'Custom',
            type: 'crypto',
          },
        ]);
      },

      resolveSymbol: (
        symbolName: string,
        onSymbolResolvedCallback: (symbolInfo: any) => void,
        onResolveErrorCallback: (error: any) => void
      ) => {
        // Always resolve to our market symbol regardless of input
        const symbolInfo = {
          ticker: collateralAssetTicker,
          name: collateralAssetTicker,
          description: collateralAssetTicker || 'Market',
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          exchange: 'Custom',
          minmov: 1,
          pricescale: 100000000,
          has_intraday: true,
          has_no_volume: false,
          has_weekly_and_monthly: true,
          supported_resolutions: ['1', '5', '15', '30', '60', '1D', '1W', '1M'],
          volume_precision: 8,
          data_status: 'streaming',
        };

        setTimeout(() => onSymbolResolvedCallback(symbolInfo));
      },

      getBars: async (
        symbolInfo: any,
        resolution: string,
        periodParams: {
          from: number;
          to: number;
          firstDataRequest: boolean;
        },
        onHistoryCallback: (
          bars: PriceChartData[],
          meta: { noData?: boolean }
        ) => void
      ) => {
        try {
          // Convert resolution to something your API understands
          // const interval = resolution.includes('D')
          //   ? parseInt(resolution, 10) * 24 * 60
          //   : parseInt(resolution, 10);
          const interval = '1D'; // use for now

          // Fetch data from your API
          const response = await fetch(
            `/api/prices/tradingView-data?` +
              `from=${periodParams.from}&` +
              `to=${periodParams.to}&` +
              `interval=${interval}&` +
              `contractId=${marketAddress}&` +
              `epochId=${epoch}`
          );

          if (!response.ok) {
            throw new Error('Failed to fetch market data');
          }

          const data: PriceChartData[] = await response.json();

          if (!data || data.length === 0) {
            onHistoryCallback([], { noData: true });
            return;
          }

          // Transform your API data to match TradingView's format if necessary
          const bars = data.map((bar) => ({
            startTimestamp: bar.startTimestamp * 1000, // Convert to milliseconds if needed
            endTimestamp: bar.endTimestamp * 1000, // Convert to milliseconds if needed
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            // volume: bar.volume,
          }));

          onHistoryCallback(bars, { noData: false });
        } catch (error) {
          console.error('Error fetching market data:', error);
          onHistoryCallback([], { noData: true });
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
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          //   symbol: `ETH`,
          //   symbol: `${collateralAssetTicker}`,
          symbol: collateralAssetTicker || 'MARKET',
          interval: '15',
          timezone: 'Etc/UTC',
          // backgroundColor: 'blue',
          theme,
          style: '1',
          locale: 'en',
          enable_publishing: false,
          withdateranges: true,
          hide_side_toolbar: false,
          save_image: true,
          show_popup_button: true,
          popup_width: '1000',
          popup_height: '650',
          container_id: 'tradingview_c10e9',
          datafeed: createDatafeed(), // Use our custom datafeed
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
  }, [marketAddress, collateralAssetTicker, theme]);

  return (
    <div
      className="tradingview-widget-container"
      style={{ height: '60vh', width: '100%' }}
    >
      <div
        id="tradingview_c10e9"
        style={{ height: 'calc(100% - 32px)', width: '100%' }}
      />
    </div>
  );
};

export default TradingViewWidget;
