import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import AmountScreen from './screens/AmountScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import SessionScreen from './screens/SessionScreen';
import MintingScreen, { type MintResult } from './screens/MintingScreen';
import CardScreen, { type Side } from './screens/CardScreen';
import LockedScreen from './screens/LockedScreen';
import { useSubmitCard } from './hooks/useSubmitCard';

export type Tier = 1 | 5 | 25;
export type Step =
  | 'amount'
  | 'checkout'
  | 'session'
  | 'minting'
  | 'card'
  | 'locked';

export default function App() {
  const [step, setStep] = useState<Step>('amount');
  const [tier, setTier] = useState<Tier | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [picks, setPicks] = useState<Side[] | null>(null);

  const { address: eoa } = useAccount();
  const smartAccountAddress = useMemo(
    () => (eoa ? computeSmartAccountAddress(eoa) : undefined),
    [eoa],
  );

  const submitter = useSubmitCard();

  const reset = () => {
    setTier(null);
    setMintResult(null);
    setPicks(null);
    setStep('amount');
  };

  return (
    <main>
      <header className="header">
        <div className="title-block">
          <h1>Parlay Bingo</h1>
        </div>
        {step !== 'amount' && (
          <button type="button" className="ghost" onClick={reset}>
            ← Start over
          </button>
        )}
      </header>

      {step === 'amount' && (
        <AmountScreen
          onPick={(t) => {
            setTier(t);
            setStep('checkout');
          }}
        />
      )}

      {step === 'checkout' && tier && (
        <CheckoutScreen tier={tier} onConfirmed={() => setStep('session')} />
      )}

      {step === 'session' && tier && (
        <SessionScreen tier={tier} onReady={() => setStep('minting')} />
      )}

      {step === 'minting' && tier && (
        <MintingScreen
          tier={tier}
          onReady={(r) => {
            setMintResult(r);
            setStep('card');
          }}
        />
      )}

      {step === 'card' && tier && mintResult && (
        <CardScreen
          tier={tier}
          conditions={mintResult.conditions}
          onSubmit={(p) => {
            setPicks(p);
            setStep('locked');
            // Fire-and-forget; LockedScreen subscribes to `submitter.progress`.
            void submitter.submit(tier, mintResult.conditions, p);
          }}
        />
      )}

      {step === 'locked' && tier && mintResult && picks && (
        <LockedScreen
          tier={tier}
          conditions={mintResult.conditions}
          picks={picks}
          smartAccountAddress={smartAccountAddress}
          progress={submitter.progress}
          isSubmitting={submitter.isSubmitting}
          error={submitter.error}
          onReset={reset}
        />
      )}
    </main>
  );
}
