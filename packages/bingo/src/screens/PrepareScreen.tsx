import { useEffect, useMemo, useRef, useState } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import {
  CHAIN_ID_ETHEREAL,
  COLLATERAL_SYMBOLS,
} from '@sapience/sdk/constants';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import { useSession } from '~/hooks/useSession';
import { prepareAccount } from '~/lib/session/sessionKeyManager';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { formatDollarLikeBalance } from '~/lib/format/balance';
import BungeeBridge from '../components/BungeeBridge';
import type { Tier } from '../App';

const CHAIN_ID = CHAIN_ID_ETHEREAL;
const SYMBOL = COLLATERAL_SYMBOLS[CHAIN_ID] ?? 'USDe';

type StepStatus = 'pending' | 'current' | 'done';

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function PrepareScreen({
  tier,
  onReady,
}: {
  tier: Tier;
  onReady: () => void;
}) {
  const tierWei = useMemo(() => parseUnits(tier.toString(), 18), [tier]);

  const { address: eoa, isConnected } = useAccount();
  const {
    connectors,
    connect,
    isPending: connectPending,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();

  const sa = useMemo(
    () => (eoa ? computeSmartAccountAddress(eoa) : undefined),
    [eoa],
  );

  const {
    rawBalance,
    balance,
    nativeBalance,
    wrappedBalance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address: sa,
    chainId: CHAIN_ID,
    enabled: !!sa,
  });

  const funded = rawBalance != null && rawBalance >= tierWei;
  const deficitWei =
    rawBalance != null && !funded ? tierWei - rawBalance : tierWei;
  const deficit = Number(deficitWei) / 1e18;

  // ---------- session + prepare ----------
  const {
    isReady: sessionReady,
    isActive,
    client,
    isStarting,
    isRestoring,
    error: sessionError,
    start,
  } = useSession();

  const [prepStatus, setPrepStatus] = useState<
    'idle' | 'preparing' | 'done' | 'error'
  >('idle');
  const [prepError, setPrepError] = useState<string | null>(null);
  const prepFiredRef = useRef(false);

  useEffect(() => {
    if (!funded) return;
    if (!sessionReady || !isActive || !client || !eoa) return;
    if (prepFiredRef.current) return;
    prepFiredRef.current = true;
    setPrepError(null);
    setPrepStatus('preparing');
    prepareAccount(client, tierWei, computeSmartAccountAddress(eoa))
      .then(() => {
        setPrepStatus('done');
        onReady();
      })
      .catch((e) => {
        setPrepStatus('error');
        setPrepError(e instanceof Error ? e.message : String(e));
        prepFiredRef.current = false;
      });
  }, [funded, sessionReady, isActive, client, eoa, tierWei, onReady]);

  const injectedConnector = connectors.find((c) => c.id === 'injected');
  const coinbaseConnector = connectors.find(
    (c) => c.id === 'coinbaseWalletSDK',
  );

  const signInProgress =
    isStarting || prepStatus === 'preparing' || isRestoring;

  // ---------- step states ----------
  const connectStatus: StepStatus = isConnected ? 'done' : 'current';
  const fundStatus: StepStatus = !isConnected
    ? 'pending'
    : funded
      ? 'done'
      : 'current';
  const signStatus: StepStatus = !funded
    ? 'pending'
    : prepStatus === 'done'
      ? 'done'
      : 'current';

  return (
    <section className="screen">
      <div>
        <h2>Get ready</h2>
        <p className="muted small">
          ${tier}.00 card · settles on Ethereal
        </p>
      </div>

      <ol className="wizard">
        <li className={`wizard-step status-${connectStatus}`}>
          <div className="wizard-step-marker" aria-hidden>
            {connectStatus === 'done' ? '✓' : '1'}
          </div>
          <div className="wizard-step-body">
            <div className="wizard-step-title">Connect</div>

            {!isConnected ? (
              <>
                <p className="muted small">
                  Connect a wallet to fund your Sapience account.
                </p>
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
                  <p className="small text-no">{connectError.message}</p>
                )}
              </>
            ) : (
              <div className="meta-strip">
                <div className="row">
                  <span className="muted small">Wallet</span>
                  <span className="mono small">
                    {shortAddress(eoa!)}{' '}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => disconnect()}
                    >
                      Disconnect
                    </button>
                  </span>
                </div>
                {sa && (
                  <div className="row">
                    <span className="muted small">Sapience account</span>
                    <span className="mono small">{shortAddress(sa)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </li>

        <li className={`wizard-step status-${fundStatus}`}>
          <div className="wizard-step-marker" aria-hidden>
            {fundStatus === 'done' ? '✓' : '2'}
          </div>
          <div className="wizard-step-body">
            <div className="wizard-step-title">Fund</div>

            {!isConnected ? (
              <p className="muted small">
                Connect your wallet to check your balance.
              </p>
            ) : rawBalance == null && balanceLoading ? (
              <p className="muted small">Checking balance…</p>
            ) : funded ? (
              <p className="muted small">
                {formatDollarLikeBalance(balance)} {SYMBOL} available
                {wrappedBalance > 0 && nativeBalance > 0
                  ? ` · ${formatDollarLikeBalance(nativeBalance)} native + ${formatDollarLikeBalance(wrappedBalance)} wrapped`
                  : ''}
              </p>
            ) : (
              <>
                <p className="muted small">
                  You have {formatDollarLikeBalance(balance)} {SYMBOL} · need{' '}
                  +{formatDollarLikeBalance(deficit)} more
                </p>
                {sa && eoa && (
                  <BungeeBridge
                    eoaAddress={eoa}
                    receiverAddress={sa}
                    prefillAmountWei={deficitWei}
                    onBridged={() => {
                      const id = window.setInterval(
                        () => refetchBalance(),
                        4000,
                      );
                      window.setTimeout(
                        () => window.clearInterval(id),
                        120_000,
                      );
                    }}
                  />
                )}
              </>
            )}
          </div>
        </li>

        <li className={`wizard-step status-${signStatus}`}>
          <div className="wizard-step-marker" aria-hidden>
            {signStatus === 'done' ? '✓' : '3'}
          </div>
          <div className="wizard-step-body">
            <div className="wizard-step-title">Sign</div>

            {!funded ? (
              <p className="muted small">
                Fund your account to enable signing.
              </p>
            ) : prepStatus === 'preparing' ? (
              <p className="muted small">
                Wrapping & approving ${tier}.00 {SYMBOL}…
              </p>
            ) : isStarting ? (
              <p className="muted small">Awaiting signature…</p>
            ) : isRestoring ? (
              <p className="muted small">Restoring session…</p>
            ) : (
              <>
                <p className="muted small">
                  One signature authorizes Sapience to mint your card for the
                  next 24 hours. Funds stay in your Sapience account; the
                  session is scoped to mint + approval.
                </p>
                <button
                  type="button"
                  className="primary block"
                  disabled={signInProgress}
                  onClick={() => start(24)}
                >
                  Sign &amp; continue
                </button>
              </>
            )}

            {funded && (sessionError || prepError) && (
              <p className="error">
                {(sessionError?.message ?? prepError) as string}
              </p>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}
