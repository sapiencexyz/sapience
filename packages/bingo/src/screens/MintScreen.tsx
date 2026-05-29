import { useMemo, useState } from 'react';
import { isAddress, parseUnits, type Address, type Hex } from 'viem';
import { useAccount, useConnect, useDisconnect, useReadContracts } from 'wagmi';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import {
  BINGO_CARD_ABI,
  CHAIN_ID,
  encodeCode,
  fmtUnits,
  loadContractAddress,
  shortAddress,
} from '../lib/bingoCard';
import { useSession } from '../hooks/useSession';
import { mintCardViaSession } from '../lib/session/sessionKeyManager';
import { useCollateralBalance } from '../hooks/blockchain/useCollateralBalance';
import { formatDollarLikeBalance } from '../lib/format/balance';
import Nav from '../components/Nav';
import BungeeBridge from '../components/BungeeBridge';

type StepStatus = 'pending' | 'current' | 'done';

const ZERO_BYTES32 = ('0x' + '00'.repeat(32)) as Hex;

export default function MintScreen() {
  const { address: eoa, isConnected } = useAccount();
  const {
    connectors,
    connect,
    isPending: connectPending,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();

  const contractAddress: Address | null = useMemo(() => {
    const a = loadContractAddress();
    return a && isAddress(a) ? (a as Address) : null;
  }, []);
  const baseContract = contractAddress
    ? { address: contractAddress, abi: BINGO_CARD_ABI, chainId: CHAIN_ID }
    : null;

  // Smart account funded + acting as the card player (deterministic from EOA).
  const sa = useMemo(
    () => (eoa ? computeSmartAccountAddress(eoa) : undefined),
    [eoa],
  );

  const reads = useReadContracts({
    contracts: baseContract
      ? [
          { ...baseContract, functionName: 'minCardPrice' },
          { ...baseContract, functionName: 'entropyFee' },
        ]
      : [],
    query: { enabled: !!baseContract },
  });
  const minCardPrice = reads.data?.[0]?.result as bigint | undefined;
  const entropyFee = reads.data?.[1]?.result as bigint | undefined;

  // ---------- chosen price (drives the rest of the flow) ----------
  const [chosenPrice, setChosenPrice] = useState<bigint | null>(null);

  // ---------- smart-account balance (drives the Fund step) ----------
  const {
    rawBalance,
    balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({ address: sa, chainId: CHAIN_ID, enabled: !!sa });

  // Need the card price plus a small native buffer for the Pyth entropy fee.
  const needed =
    chosenPrice != null
      ? chosenPrice + (entropyFee != null ? entropyFee * 4n : 0n)
      : null;
  const funded =
    needed != null && rawBalance != null && rawBalance >= needed;
  const deficitWei =
    needed != null && rawBalance != null && !funded
      ? needed - rawBalance
      : (needed ?? 0n);
  const deficit = Number(deficitWei) / 1e18;

  // ---------- session ----------
  const {
    client: sessionClient,
    isActive,
    isStarting,
    isRestoring,
    error: sessionError,
    start,
    end,
  } = useSession();

  // ---------- referral code ----------
  const [codeInput, setCodeInput] = useState('');
  const encodedCode = codeInput.trim() ? encodeCode(codeInput) : null;

  // ---------- mint ----------
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const onMint = async () => {
    if (!sessionClient || !sa || chosenPrice == null || entropyFee == null) {
      return;
    }
    setMintError(null);
    setMinting(true);
    try {
      const refCode =
        codeInput.trim() && encodedCode ? encodedCode : ZERO_BYTES32;
      const { cardId } = await mintCardViaSession({
        client: sessionClient,
        smartAccountAddress: sa,
        cardPriceWei: chosenPrice,
        refCode,
        entropyFeeWei: entropyFee,
      });
      window.history.pushState({}, '', `/card/${cardId.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) {
      setMintError(e instanceof Error ? e.message : String(e));
    } finally {
      setMinting(false);
    }
  };

  const started = chosenPrice != null;
  const injected = connectors.find((c) => c.id === 'injected');
  const coinbase = connectors.find((c) => c.id === 'coinbaseWalletSDK');

  // ---------- step states ----------
  const connectStatus: StepStatus = isConnected ? 'done' : 'current';
  const fundStatus: StepStatus = !isConnected
    ? 'pending'
    : funded
      ? 'done'
      : 'current';
  const signStatus: StepStatus = !funded
    ? 'pending'
    : isActive
      ? 'done'
      : 'current';
  const mintStatus: StepStatus = !isActive ? 'pending' : 'current';

  if (!contractAddress) {
    return (
      <main>
        <Nav />
        <header className="header">
          <div className="title-block">
            <h1>Draw a card</h1>
          </div>
        </header>
        <section className="screen">
          <p className="muted small">
            Set the BingoCard contract address in Settings (gear icon) to get
            started.
          </p>
        </section>
      </main>
    );
  }

  // Entry screen — pick the card amount.
  if (!started) {
    return <AmountPicker minCardPrice={minCardPrice} onPick={setChosenPrice} />;
  }

  return (
    <main>
      <Nav />
      <button
        type="button"
        className="back-link"
        onClick={() => setChosenPrice(null)}
      >
        ← Back
      </button>
      <section className="screen">
        <div>
          <h2>Get ready</h2>
        </div>

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
              ) : rawBalance == null && balanceLoading ? (
                <p className="muted small">Checking balance…</p>
              ) : funded ? (
                <p className="muted small">
                  {formatDollarLikeBalance(balance)} USDe available
                </p>
              ) : (
                <>
                  <p className="muted small">
                    You have {formatDollarLikeBalance(balance)} USDe · need +
                    {formatDollarLikeBalance(deficit)} USDe more.
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
                    One signature authorizes Sapience to draw your card and
                    fund its 10 lines for the next 7 days. Funds stay in your
                    Sapience account.
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
              {funded && sessionError && (
                <p className="error small">{sessionError.message}</p>
              )}
            </div>
          </li>

          <li className={`wizard-step status-${mintStatus}`}>
            <div className="wizard-step-marker" aria-hidden>
              4
            </div>
            <div className="wizard-step-body">
              <div className="wizard-step-title">Draw</div>
              {!isActive ? (
                <p className="muted small">
                  Sign the session to draw your card.
                </p>
              ) : (
                <>
                  <div className="field">
                    <label className="label" htmlFor="refcode">
                      Referral code (optional)
                    </label>
                    <input
                      id="refcode"
                      className="admin-input"
                      placeholder="e.g. NOAH"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      disabled={minting}
                    />
                    {codeInput.trim() && encodedCode == null && (
                      <p className="muted small">
                        ⚠ Code too long (max 32 bytes).
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="primary block"
                    style={{ marginTop: '0.75rem' }}
                    disabled={minting || entropyFee == null}
                    onClick={onMint}
                  >
                    {minting
                      ? 'Drawing…'
                      : `Draw Card for ${fmtUnits(chosenPrice ?? undefined)} USDe`}
                  </button>
                  {mintError && <p className="error small">{mintError}</p>}
                </>
              )}
            </div>
          </li>
        </ol>
      </section>
    </main>
  );
}

const PRESETS = [1n, 5n, 25n] as const;

function AmountPicker({
  minCardPrice,
  onPick,
}: {
  minCardPrice: bigint | undefined;
  onPick: (price: bigint) => void;
}) {
  const [customInput, setCustomInput] = useState('');

  // Card price must be a multiple of LINES_PER_CARD (10).
  const parseCustom = (): bigint | null => {
    const v = customInput.trim();
    if (!v) return null;
    try {
      const wei = parseUnits(v, 18);
      if (wei <= 0n) return null;
      if (wei % 10n !== 0n) return null;
      if (minCardPrice != null && wei < minCardPrice) return null;
      return wei;
    } catch {
      return null;
    }
  };
  const customWei = parseCustom();

  const presetAllowed = (n: bigint): boolean => {
    const wei = n * 10n ** 18n;
    return minCardPrice == null || wei >= minCardPrice;
  };

  return (
    <main>
      <Nav />
      <section className="screen">
        <h2 className="amount-heading">Pick an amount</h2>
        <div className="tier-grid">
          {PRESETS.map((n) => (
            <button
              key={n.toString()}
              type="button"
              className="tier-button"
              disabled={!presetAllowed(n)}
              onClick={() => onPick(n * 10n ** 18n)}
            >
              <span className="tier-price">${n.toString()}</span>
              <span className="tier-label">per card</span>
            </button>
          ))}
        </div>
        <div className="field">
          <div className="wizard-step-title">Or pick a custom amount</div>
          <div className="admin-row">
            <input
              className="admin-input"
              placeholder="e.g. 10"
              inputMode="decimal"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
            />
            <button
              type="button"
              className="primary"
              disabled={customWei == null}
              onClick={() => customWei != null && onPick(customWei)}
            >
              Use this amount
            </button>
          </div>
          {customInput.trim() && customWei == null && (
            <p className="muted small">
              Must be a positive multiple of 0.00000000000000001 (10 wei)
              {minCardPrice != null
                ? ` and at least ${fmtUnits(minCardPrice)}`
                : ''}
              .
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
