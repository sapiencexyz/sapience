import type { ComputedQuote } from '../lib/pricing';

interface QuoteListProps {
  quotes: ComputedQuote[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function formatTimeRemaining(expiryTs: number): string {
  const secsLeft = Math.max(0, Math.round(expiryTs - Date.now() / 1000));
  if (secsLeft >= 60) return `${Math.floor(secsLeft / 60)}m`;
  return `${secsLeft}s`;
}

function formatStrike(strike: number): string {
  if (strike >= 1000) return strike.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (strike >= 1) return strike.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return strike.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function QuoteCard({ quote }: { quote: ComputedQuote }) {
  return (
    <div className="quote-card">
      <div className="quote-card-header">
        <span className="auction-id">{quote.auctionId.slice(0, 8)}</span>
        <span className="timestamp">{formatTime(quote.timestamp)}</span>
      </div>

      <div className="quote-legs">
        {quote.legs.map((leg, i) => {
          const isOver = leg.predictedOutcome === 'Yes';
          return (
            <div className="leg" key={i}>
              <span className="leg-name">
                <span className="leg-ticker">{leg.ticker}</span>
                {' '}
                <span className={isOver ? 'leg-over' : 'leg-under'}>
                  {isOver ? 'OVER' : 'UNDER'}
                </span>
                {' '}
                <span>{formatStrike(leg.strike)}</span>
                {leg.expiryTs > 0 && (
                  <span className="leg-time"> IN {formatTimeRemaining(leg.expiryTs)}</span>
                )}
              </span>
              {leg.successProb !== null && (
                <span className="leg-prob"> {(leg.successProb * 100).toFixed(1)}%</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="quote-summary">
        <span>
          <span className="quote-bid">{quote.bidAmount} USDe</span>
          {' vs '}
          {quote.predictorCollateral} USDe
        </span>
        <span className="quote-prob">
          P(win): {(quote.counterpartyWinProb * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function QuoteList({ quotes }: QuoteListProps) {
  if (quotes.length === 0) {
    return <div className="empty-state">Waiting for 2-leg Pyth parlays...</div>;
  }

  return (
    <div className="quote-list">
      {quotes.map((q) => (
        <QuoteCard key={`${q.auctionId}-${q.timestamp}`} quote={q} />
      ))}
    </div>
  );
}
