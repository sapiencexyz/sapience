import { useMemo } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { parseUnits } from 'viem';
import {
  CHAIN_ID_ETHEREAL,
  COLLATERAL_SYMBOLS,
} from '@sapience/sdk/constants';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import type { Tier } from '../App';
import BungeeBridge from '../components/BungeeBridge';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { formatDollarLikeBalance } from '~/lib/format/balance';

const CHAIN_ID = CHAIN_ID_ETHEREAL;
const SYMBOL = COLLATERAL_SYMBOLS[CHAIN_ID] ?? 'USDe';

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function CheckoutScreen({
  tier,
  onConfirmed,
}: {
  tier: Tier;
  onConfirmed: () => void;
}) {
  const tierWei = useMemo(() => parseUnits(tier.toString(), 18), [tier]);

  const { address: eoaAddress, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending, error: connectError } =
    useConnect();
  const { disconnect } = useDisconnect();

  // The Sapience smart account is derived from the connected EOA via Kernel
  // V3.1 CREATE2 — same address on every chain, no RPC needed.
  const smartAccountAddress = useMemo(
    () => (eoaAddress ? computeSmartAccountAddress(eoaAddress) : undefined),
    [eoaAddress],
  );

  // Ethereal collateral = native USDe + wrapped wUSDe (both 18 dec, summed).
  // Same hook the main app uses, scoped to the smart account.
  const {
    rawBalance,
    balance,
    nativeBalance,
    wrappedBalance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address: smartAccountAddress,
    chainId: CHAIN_ID,
    enabled: !!smartAccountAddress,
  });

  const hasEnough = rawBalance != null && rawBalance >= tierWei;
  const deficitWei =
    rawBalance != null && !hasEnough ? tierWei - rawBalance : tierWei;
  const deficit = Number(deficitWei) / 1e18;

  const injectedConnector = connectors.find((c) => c.id === 'injected');
  const coinbaseConnector = connectors.find((c) => c.id === 'coinbaseWalletSDK');

  // ---------- not connected ----------
  if (!isConnected || !eoaAddress) {
    return (
      <section className="screen">
        <h2>Checkout</h2>
        <div className="checkout-card">
          <div className="row">
            <span className="muted">Card price</span>
            <span className="big">
              ${tier}.00 {SYMBOL}
            </span>
          </div>

          {injectedConnector && (
            <button
              type="button"
              className="primary block"
              disabled={connectPending}
              onClick={() => connect({ connector: injectedConnector })}
            >
              {connectPending ? 'Opening wallet…' : 'Connect wallet'}
            </button>
          )}
          {coinbaseConnector && (
            <button
              type="button"
              className="ghost block"
              disabled={connectPending}
              onClick={() => connect({ connector: coinbaseConnector })}
            >
              Connect Coinbase Wallet
            </button>
          )}
          {connectError && (
            <p className="small" style={{ color: '#b8232a' }}>
              {connectError.message}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ---------- connected, balance loading ----------
  if (rawBalance == null && balanceLoading) {
    return (
      <section className="screen">
        <h2>Checkout</h2>
        <div className="checkout-card">
          <div className="row">
            <span className="muted">Wallet</span>
            <span className="mono">{shortAddress(eoaAddress)}</span>
          </div>
          <div className="row">
            <span className="muted">{SYMBOL} balance</span>
            <span className="mono">Checking…</span>
          </div>
        </div>
      </section>
    );
  }

  // ---------- connected, enough balance ----------
  if (hasEnough) {
    return (
      <section className="screen">
        <h2>Checkout</h2>
        <div className="checkout-card">
          <div className="row">
            <span className="muted">Card price</span>
            <span className="big">
              ${tier}.00 {SYMBOL}
            </span>
          </div>
          <div className="row">
            <span className="muted">Wallet</span>
            <span className="mono">
              {shortAddress(eoaAddress)}{' '}
              <button
                type="button"
                className="ghost"
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            </span>
          </div>
          {smartAccountAddress && (
            <div className="row">
              <span className="muted">Sapience Account</span>
              <span className="mono">{shortAddress(smartAccountAddress)}</span>
            </div>
          )}
          <div className="row">
            <span className="muted">{SYMBOL} on Ethereal</span>
            <span className="mono">
              {formatDollarLikeBalance(balance)} {SYMBOL}
            </span>
          </div>
          {wrappedBalance > 0 && nativeBalance > 0 && (
            <div className="row">
              <span className="muted small">
                ({formatDollarLikeBalance(nativeBalance)} native +{' '}
                {formatDollarLikeBalance(wrappedBalance)} wrapped)
              </span>
              <span />
            </div>
          )}
          <button type="button" className="primary block" onClick={onConfirmed}>
            Let's go!
          </button>
        </div>
      </section>
    );
  }

  // ---------- connected, insufficient balance ----------
  return (
    <section className="screen">
      <h2>Checkout</h2>
      <div className="checkout-card">
        <div className="row">
          <span className="muted">Card price</span>
          <span className="big">
            ${tier}.00 {SYMBOL}
          </span>
        </div>
        <div className="row">
          <span className="muted">Wallet</span>
          <span className="mono">
            {shortAddress(eoaAddress)}{' '}
            <button
              type="button"
              className="ghost"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </span>
        </div>
        {smartAccountAddress && (
          <div className="row">
            <span className="muted">Sapience Account</span>
            <span className="mono">{shortAddress(smartAccountAddress)}</span>
          </div>
        )}
        <div className="row">
          <span className="muted">{SYMBOL} on Ethereal</span>
          <span className="mono">
            {formatDollarLikeBalance(balance)} {SYMBOL}
          </span>
        </div>
        <div className="deposit">
          <div className="muted small">You're short:</div>
          <div className="big" style={{ color: '#b8232a' }}>
            +{formatDollarLikeBalance(deficit)} {SYMBOL}
          </div>
        </div>
        {smartAccountAddress && (
          <BungeeBridge
            eoaAddress={eoaAddress}
            receiverAddress={smartAccountAddress}
            prefillAmountWei={deficitWei}
            onBridged={() => {
              const id = window.setInterval(() => refetchBalance(), 4000);
              window.setTimeout(() => window.clearInterval(id), 120_000);
            }}
          />
        )}
      </div>
    </section>
  );
}
