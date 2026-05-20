import { useEffect, useRef, useState } from 'react';
import { parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import { useSession } from '~/hooks/useSession';
import { prepareAccount } from '~/lib/session/sessionKeyManager';
import type { Tier } from '~/App';

const STEP_LABELS: Record<string, string> = {
  'switching-network': 'Switching to Ethereal…',
  'requesting-approval': 'Awaiting wallet signature…',
  'deploying-account': 'Deploying smart account…',
  finalizing: 'Finalizing session…',
};

export default function SessionScreen({
  tier,
  onReady,
}: {
  tier: Tier;
  onReady: () => void;
}) {
  const { address: eoa } = useAccount();
  const {
    isReady,
    isActive,
    client,
    isStarting,
    isRestoring,
    step,
    error,
    start,
  } = useSession();

  const [prepStatus, setPrepStatus] = useState<
    'idle' | 'preparing' | 'done' | 'error'
  >('idle');
  const [prepError, setPrepError] = useState<string | null>(null);
  const prepFiredRef = useRef(false);

  // Run prepareAccount (wrap + approve for full tier) once the session is
  // active. Idempotent — skips if SA already has enough wUSDe + allowance.
  useEffect(() => {
    if (!isReady || !isActive || !client || !eoa) {
      console.log(
        '[SessionScreen] prep effect skip: isReady=' +
          isReady +
          ' isActive=' +
          isActive +
          ' client=' +
          !!client +
          ' eoa=' +
          !!eoa,
      );
      return;
    }
    if (prepFiredRef.current) {
      console.log('[SessionScreen] prep already fired');
      return;
    }
    prepFiredRef.current = true;

    const sa = computeSmartAccountAddress(eoa);
    const tierWei = parseUnits(String(tier), 18);
    console.log(
      '[SessionScreen] firing prepareAccount tier=$' +
        tier +
        ' (' +
        tierWei +
        ' wei) sa=' +
        sa,
    );

    setPrepStatus('preparing');
    prepareAccount(client, tierWei, sa)
      .then(() => {
        console.log('[SessionScreen] prepareAccount complete → advancing');
        setPrepStatus('done');
        onReady();
      })
      .catch((e) => {
        console.error('[SessionScreen] prepareAccount failed:', e);
        setPrepStatus('error');
        setPrepError(e instanceof Error ? e.message : String(e));
        prepFiredRef.current = false;
      });
  }, [isReady, isActive, client, eoa, tier, onReady]);

  if (!isReady || isRestoring) {
    return (
      <section className="screen center-screen">
        <div className="spinner" />
        <p className="muted">Restoring session…</p>
      </section>
    );
  }

  if (isActive && prepStatus === 'preparing') {
    return (
      <section className="screen center-screen">
        <div className="spinner" />
        <p className="muted">Wrapping & approving ${tier}.00 USDe…</p>
      </section>
    );
  }

  if (isActive && prepStatus === 'done') return null;

  return (
    <section className="screen">
      <h2>Enable signing</h2>
      <div className="checkout-card">
        <p style={{ color: 'var(--ink-deep)' }}>
          Sign once to authorize Sapience to mint your card on your behalf for
          the next 24 hours. No more wallet popups per line.
        </p>

        <ul
          style={{
            color: 'var(--ink-deep)',
            margin: 0,
            paddingInlineStart: '1.1rem',
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          <li>Funds stay in your Sapience smart account.</li>
          <li>
            Permission is limited to PredictionMarketEscrow.mint and the wUSDe
            approval it needs.
          </li>
          <li>Expires automatically; you can revoke any time.</li>
        </ul>

        {step && (
          <p className="muted small center">{STEP_LABELS[step] ?? step}</p>
        )}

        {(error || prepError) && (
          <p className="error">{(error?.message ?? prepError) as string}</p>
        )}

        <button
          type="button"
          className="primary block"
          disabled={isStarting}
          onClick={() => start(24)}
        >
          {isStarting ? 'Signing…' : 'Sign & enable session'}
        </button>
      </div>
    </section>
  );
}
