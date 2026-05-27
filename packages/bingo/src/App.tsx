import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import AmountScreen from './screens/AmountScreen';
import PrepareScreen from './screens/PrepareScreen';
import MintingScreen, { type MintResult } from './screens/MintingScreen';
import CardScreen, { type Side } from './screens/CardScreen';
import LockedScreen from './screens/LockedScreen';
import AdminScreen from './screens/AdminScreen';
import MintScreen from './screens/MintScreen';
import CardDetailScreen from './screens/CardDetailScreen';
import ReferScreen from './screens/ReferScreen';
import Nav from './components/Nav';
import { useSubmitCard } from './hooks/useSubmitCard';

export type Tier = 1 | 5 | 25;
export type Step = 'amount' | 'prepare' | 'minting' | 'card' | 'locked';

export default function App() {
  // Pathname-driven routing. MintScreen pushes /card/:id then dispatches a
  // popstate so we re-render. Pure router — every screen owns its own hooks.
  const [pathname, setPathname] = useState<string>(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  useEffect(() => {
    const onNav = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);

  if (pathname.startsWith('/admin')) return <AdminScreen />;
  const cardMatch = pathname.match(/^\/card\/(\d+)\/?$/);
  if (cardMatch) return <CardDetailScreen cardId={BigInt(cardMatch[1])} />;
  if (pathname.startsWith('/refer')) return <ReferScreen />;
  if (pathname.startsWith('/play')) return <MintScreen />;

  return <DemoFlow />;
}

function DemoFlow() {
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
      <Nav />
      <header className="header">
        <div className="title-block">
          <svg
            className="title-mark"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="12,7 17,10.5 15,16 9,16 7,10.5" />
            <line x1="12" y1="7" x2="12" y2="2" />
            <line x1="17" y1="10.5" x2="21.5" y2="9" />
            <line x1="15" y1="16" x2="18" y2="20" />
            <line x1="9" y1="16" x2="6" y2="20" />
            <line x1="7" y1="10.5" x2="2.5" y2="9" />
          </svg>
          <h1>World Cup Bingo</h1>
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
            setStep('prepare');
          }}
        />
      )}

      {step === 'prepare' && tier && (
        <PrepareScreen tier={tier} onReady={() => setStep('minting')} />
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
