import { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import { CHAIN_ID, NETWORK } from '../lib/chain';
import {
  fmtUnits,
  formatDollarLikeBalance,
  shortAddress,
} from '../lib/format/balance';
import { fetchPool, type PoolResponse } from '../lib/backendApi';
import { useSession } from '../hooks/useSession';
import { useSponsorStatus } from '../hooks/useSponsorStatus';
import { useCollateralBalance } from '../hooks/blockchain/useCollateralBalance';
import BungeeBridge from './BungeeBridge';

type StepStatus = 'pending' | 'current' | 'done';

/**
 * Get-ready wizard: Connect → Fund → Sign. Rendered inline in the play hub
 * until the session is active, at which point the hub swaps to the card — so
 * there is no final "view your card" step here.
 */
export default function SetupWizard({ poolId }: { poolId?: string | null }) {
  const { address: eoa, isConnected } = useAccount();
  const {
    connectors,
    connect,
    isPending: connectPending,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();

  // Smart account funded + acting as the card player (deterministic from EOA).
  const sa = useMemo(
    () => (eoa ? computeSmartAccountAddress(eoa) : undefined),
    [eoa],
  );

  // Pool config from the backend — the min card price gates the fund step.
  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    fetchPool(poolId)
      .then((p) => {
        if (stop) return;
        // Each backend serves one network; catch a frontend pointed at the
        // wrong one before any session/mint runs into chainId mismatches.
        if (p.chainId !== undefined && p.chainId !== CHAIN_ID) {
          setPoolError(
            `Backend is on ${p.network ?? `chain ${p.chainId}`}, but the app ` +
              `is set to ${NETWORK}. Fix the network or backend URL in Settings.`,
          );
          return;
        }
        setPool(p);
      })
      .catch((e) => {
        if (!stop) setPoolError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stop = true;
    };
  }, [poolId]);
  const minCardPriceWei = pool ? BigInt(pool.minCardPriceWei) : null;

  // ---------- smart-account balance (drives the Fund step) ----------
  const {
    rawBalance,
    balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({ address: sa, chainId: CHAIN_ID, enabled: !!sa });

  // Native + wUSDe is one fungible bucket: the backend session wraps native
  // USDe as needed before minting lines.
  const needed = minCardPriceWei;
  const funded = needed != null && rawBalance != null && rawBalance >= needed;
  const deficitWei =
    needed != null && rawBalance != null && !funded
      ? needed - rawBalance
      : (needed ?? 0n);

  // ---------- session ----------
  const {
    isActive,
    isStarting,
    isRestoring,
    error: sessionError,
    start,
    end,
  } = useSession();

  const injected = connectors.find((c) => c.id === 'injected');
  const coinbase = connectors.find((c) => c.id === 'coinbaseWalletSDK');

  // Sponsored players skip the deposit — the house funds the card from budget.
  const { eligible: sponsorEligible, status: sponsorStatus } =
    useSponsorStatus(sa);
  // Either funded OR sponsored unblocks Sign (the deposit is optional).
  const readyToSign = funded || sponsorEligible;

  // ---------- step states ----------
  const connectStatus: StepStatus = isConnected ? 'done' : 'current';
  const fundStatus: StepStatus = !isConnected
    ? 'pending'
    : funded || sponsorEligible
      ? 'done'
      : 'current';
  const signStatus: StepStatus = !readyToSign
    ? 'pending'
    : isActive
      ? 'done'
      : 'current';

  return (
    <section className="screen">
      <div>
        <h2>Get ready</h2>
      </div>
      {poolError && <p className="error small">{poolError}</p>}

      <ol className="wizard">
        <li className={`wizard-step status-${connectStatus}`}>
          <div className="wizard-step-marker" aria-hidden>
            {connectStatus === 'done' ? '✓' : '1'}
          </div>
          <div className="wizard-step-body">
            <div className="wizard-step-header">
              <div className="wizard-step-title">Connect</div>
              {isConnected && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              )}
            </div>
            {!isConnected ? (
              <>
                <p className="muted small">
                  Connect a wallet to fund your Sapience account.
                </p>
                {injected && (
                  <button
                    type="button"
                    className="primary block"
                    disabled={connectPending}
                    onClick={() => connect({ connector: injected })}
                  >
                    {connectPending ? 'Opening wallet…' : 'Connect wallet'}
                  </button>
                )}
                {coinbase && (
                  <button
                    type="button"
                    className="ghost block"
                    disabled={connectPending}
                    onClick={() => connect({ connector: coinbase })}
                  >
                    Connect Coinbase Wallet
                  </button>
                )}
                {connectError && (
                  <p className="error small">{connectError.message}</p>
                )}
              </>
            ) : (
              <div className="meta-strip">
                <div className="row">
                  <span className="muted small">Wallet</span>
                  <span className="mono small">{shortAddress(eoa!)}</span>
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
            ) : balanceLoading ? (
              <p className="muted small">Checking balance…</p>
            ) : funded ? (
              <p className="muted small">
                {formatDollarLikeBalance(balance)} USDe available
              </p>
            ) : sponsorEligible ? (
              <p className="muted small">
                Sponsored — no deposit needed
                {sponsorStatus &&
                  BigInt(sponsorStatus.remainingWei) > 0n &&
                  ` · ${fmtUnits(BigInt(sponsorStatus.remainingWei))} USDe remaining`}
                .
              </p>
            ) : (
              <>
                <p className="muted small">
                  You have {formatDollarLikeBalance(balance)} USDe
                  {minCardPriceWei != null
                    ? ` · need +${fmtUnits(deficitWei)} USDe more (min card price ${fmtUnits(minCardPriceWei)})`
                    : ''}
                  .
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
            {!readyToSign ? (
              <p className="muted small">
                Fund your account to enable signing.
              </p>
            ) : isActive ? (
              <div className="row">
                <span className="muted small">Session active</span>
                <button type="button" className="ghost" onClick={() => end()}>
                  End session
                </button>
              </div>
            ) : isStarting ? (
              <p className="muted small">Awaiting signature…</p>
            ) : isRestoring ? (
              <p className="muted small">Restoring session…</p>
            ) : (
              <>
                <p className="muted small">
                  One signature authorizes COMBO.BINGO to fund your card's 10
                  lines for the next 7 days. Funds stay in your Sapience
                  account.
                </p>
                <button
                  type="button"
                  className="primary block"
                  disabled={isStarting}
                  onClick={() => start(24 * 7)}
                >
                  Sign &amp; continue
                </button>
              </>
            )}
            {readyToSign && sessionError && (
              <p className="error small">{sessionError.message}</p>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}
