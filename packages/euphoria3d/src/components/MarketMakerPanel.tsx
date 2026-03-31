import type { ComputedQuote } from '../lib/pricing';
import type { MarketMakerConfig } from '../hooks/useMarketMaker';
import type { TokenSetupState } from '../hooks/useTokenSetup';
import { LegLabel } from './LegLabel';

interface MarketMakerPanelProps {
  quotes: ComputedQuote[];
  config: MarketMakerConfig;
  onConfigChange: (updates: Partial<MarketMakerConfig>) => void;
  status: string;
  tokenSetup?: TokenSetupState;
  approveAmount?: string;
  onApproveAmountChange?: (val: string) => void;
  showApproveInput?: boolean;
  onShowApproveInput?: (show: boolean) => void;
  onApprove?: () => void;
  isSessionActive?: boolean;
}

function QuoteRow({ quote }: { quote: ComputedQuote }) {
  return (
    <div className="quote-row">
      <span className="quote-row-legs">
        {quote.legs.map((leg, i) => (
          <span key={i}>
            {i > 0 && <span className="leg-separator"> &amp;&amp; </span>}
            <LegLabel ticker={leg.ticker} isOver={leg.predictedOutcome === 'Yes'} strike={leg.strike} expiryTs={leg.expiryTs} />
          </span>
        ))}
      </span>
      <span className="quote-row-size">{Number(quote.predictorCollateral).toFixed(4)}</span>
      <span className="quote-row-bid">{Number(quote.bidAmount).toFixed(4)}</span>
      <span className="quote-row-prob">{(quote.counterpartyWinProb * 100).toFixed(0)}%</span>
      <span
        className={`quote-row-sent ${quote.bidSent ? 'quote-row-sent-yes' : ''} ${quote.bidSkipReason ? 'quote-row-sent-warn' : ''}`}
        title={quote.bidSkipReason || undefined}
      >
        {quote.bidSent ? '✓' : quote.bidSkipReason ? '⚠' : '–'}
      </span>
    </div>
  );
}

export function MarketMakerPanel({
  quotes,
  config,
  onConfigChange,
  status,
  tokenSetup,
  approveAmount,
  onApproveAmountChange,
  showApproveInput,
  onShowApproveInput,
  onApprove,
  isSessionActive,
}: MarketMakerPanelProps) {
  return (
    <>
      <div className="panel-header">
        <span>Automated Market Maker</span>
        <span className={`status-${status}`}>
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </span>
      </div>

      <div className="mm-controls">
        <label className="mm-toggle">
          <input
            type="checkbox"
            checked={config.autoBidEnabled}
            onChange={(e) => onConfigChange({ autoBidEnabled: e.target.checked })}
          />
          <span>Auto-Bid</span>
        </label>

        <div className="mm-field">
          <span className="mm-label">Edge</span>
          <input
            className="mm-input"
            type="number"
            value={config.edgeBps}
            onChange={(e) => onConfigChange({ edgeBps: Number(e.target.value) || 0 })}
          />
          <span className="mm-unit">bps</span>
        </div>

        <div className="mm-field">
          <span className="mm-label">Corr</span>
          <input
            className="mm-input"
            type="number"
            step="0.1"
            min="-1"
            max="1"
            value={config.correlationCoeff}
            onChange={(e) => onConfigChange({ correlationCoeff: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="mm-field">
          <span className="mm-label">Vol</span>
          <input
            className="mm-input"
            type="number"
            step="0.1"
            value={(config.volatility * 100)}
            onChange={(e) => onConfigChange({ volatility: (Number(e.target.value) || 80) / 100 })}
          />
          <span className="mm-unit">%</span>
        </div>

        <div className="mm-field">
          <span className="mm-label">Max</span>
          <input
            className="mm-input"
            type="number"
            value={config.maxBid}
            onChange={(e) => onConfigChange({ maxBid: Number(e.target.value) || 100 })}
          />
          <span className="mm-unit">USDe</span>
        </div>
      </div>

      {isSessionActive && tokenSetup && (
        <div className="mm-token-section">
          <span className="token-info">
            <span className="token-label">bal:</span>
            <span className="token-value">{Number(tokenSetup.effectiveBalanceFormatted).toFixed(2)}</span>
          </span>
          <span className="token-info">
            <span className="token-label">approved:</span>
            <span className="token-value">{Number(tokenSetup.allowanceFormatted).toFixed(2)}</span>
          </span>
          {showApproveInput ? (
            <div className="approve-input-wrap">
              <input
                className="approve-input"
                type="number"
                min="0"
                step="10"
                value={approveAmount}
                onChange={(e) => onApproveAmountChange?.(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onApprove?.()}
              />
              <button
                className="token-approve-btn"
                onClick={onApprove}
                disabled={tokenSetup.isApproving}
              >
                {tokenSetup.isApproving ? '...' : 'OK'}
              </button>
            </div>
          ) : (
            <button
              className="token-approve-btn"
              onClick={() => onShowApproveInput?.(true)}
            >
              Approve
            </button>
          )}
        </div>
      )}

      {quotes.length === 0 ? (
        <div className="empty-state">Waiting for auctions...</div>
      ) : (
        <div className="quote-list">
          <div className="quote-row quote-row-header">
            <span className="quote-row-legs">Request for Quote</span>
            <span className="quote-row-size">Size</span>
            <span className="quote-row-bid">Bid</span>
            <span className="quote-row-prob">P(w)</span>
            <span className="quote-row-sent">Sent</span>
          </div>
          {quotes.map((q) => (
            <QuoteRow key={`${q.auctionId}-${q.timestamp}`} quote={q} />
          ))}
        </div>
      )}

    </>
  );
}
