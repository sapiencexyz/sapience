import { useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { shortAddress } from '../lib/format/balance';
import Nav from '../components/Nav';

export default function ReferScreen() {
  const { address: eoa, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const [copied, setCopied] = useState(false);

  const injected = connectors.find((c) => c.id === 'injected');
  const shareLink = eoa
    ? `${window.location.origin}/?ref=${eoa}`
    : null;

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* clipboard unavailable — the link is selectable below */
    }
  };

  return (
    <main>
      <Nav />
      <header className="header">
        <div className="title-block">
          <h1>Refer</h1>
        </div>
      </header>

      <section className="screen admin-section">
        <h2>Share your link</h2>
        <p className="muted small">
          When someone opens your link and completes a card, you earn the
          referral cut of their card price. Referral rewards are paid out
          directly by COMBO.BINGO to your address — no claiming required.
        </p>

        {!isConnected && injected && (
          <button
            type="button"
            className="primary block"
            disabled={connectPending}
            onClick={() => connect({ connector: injected })}
          >
            {connectPending ? 'Opening wallet…' : 'Connect wallet'}
          </button>
        )}

        {isConnected && (
          <>
            <p className="muted small">Wallet: {shortAddress(eoa)}</p>
            <div className="admin-row">
              <input
                className="admin-input"
                readOnly
                value={shareLink ?? ''}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="primary" onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
