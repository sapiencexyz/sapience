import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  isAddress,
  maxUint256,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem';
import {
  useAccount,
  useConnect,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  BINGO_CARD_ABI,
  CHAIN_ID,
  ERC20_ABI,
  encodeCode,
  fmtUnits,
  loadContractAddress,
  saveContractAddress,
  shortAddress,
} from '../lib/bingoCard';
import Nav from '../components/Nav';

export default function MintScreen() {
  const { address: eoa, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();

  const [addressInput, setAddressInput] = useState<string>(
    loadContractAddress() ?? '',
  );
  const contractAddress: Address | null = useMemo(
    () => (isAddress(addressInput) ? (addressInput as Address) : null),
    [addressInput],
  );
  const baseContract = contractAddress
    ? { address: contractAddress, abi: BINGO_CARD_ABI, chainId: CHAIN_ID }
    : null;

  const reads = useReadContracts({
    contracts: baseContract
      ? [
          { ...baseContract, functionName: 'collateralToken' },
          { ...baseContract, functionName: 'cardPrice' },
          { ...baseContract, functionName: 'entropyFee' },
          { ...baseContract, functionName: 'poolSize' },
        ]
      : [],
    query: { enabled: !!baseContract },
  });
  const collateralToken = reads.data?.[0]?.result as Address | undefined;
  const cardPrice = reads.data?.[1]?.result as bigint | undefined;
  const entropyFee = reads.data?.[2]?.result as bigint | undefined;
  const poolSize = reads.data?.[3]?.result as bigint | undefined;

  const multReads = useReadContracts({
    contracts: baseContract
      ? Array.from({ length: 11 }, (_, i) => ({
          ...baseContract,
          functionName: 'multiplierBps' as const,
          args: [BigInt(i)],
        }))
      : [],
    query: { enabled: !!baseContract },
  });
  const multipliers = multReads.data?.map(
    (r) => (r?.result as number | undefined) ?? 0,
  );

  const allowanceReads = useReadContracts({
    contracts:
      collateralToken && eoa && contractAddress
        ? [
            {
              address: collateralToken,
              abi: ERC20_ABI,
              chainId: CHAIN_ID,
              functionName: 'allowance',
              args: [eoa, contractAddress],
            },
            {
              address: collateralToken,
              abi: ERC20_ABI,
              chainId: CHAIN_ID,
              functionName: 'balanceOf',
              args: [eoa],
            },
          ]
        : [],
    query: { enabled: !!collateralToken && !!eoa && !!contractAddress },
  });
  const allowance = allowanceReads.data?.[0]?.result as bigint | undefined;
  const balance = allowanceReads.data?.[1]?.result as bigint | undefined;
  const needsApproval =
    cardPrice != null && (allowance == null || allowance < cardPrice);

  const [codeInput, setCodeInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const {
    writeContract,
    isPending: writePending,
    error: writeError,
    data: lastTxHash,
  } = useWriteContract();
  const { isLoading: txLoading, data: txReceipt } =
    useWaitForTransactionReceipt({ hash: lastTxHash, chainId: CHAIN_ID });

  // On CardMinted receipt, navigate to /card/:id.
  useEffect(() => {
    if (!txReceipt || !contractAddress) return;
    const events = parseEventLogs({
      abi: BINGO_CARD_ABI,
      eventName: 'CardMinted',
      logs: txReceipt.logs,
    });
    const own = events.find(
      (e) => e.address.toLowerCase() === contractAddress.toLowerCase(),
    );
    if (own && own.args && 'cardId' in own.args) {
      const id = own.args.cardId as bigint;
      window.history.pushState({}, '', `/card/${id.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [txReceipt, contractAddress]);

  const saveAddress = () => {
    if (!isAddress(addressInput)) return;
    saveContractAddress(addressInput);
  };

  const submitApprove = () => {
    if (!collateralToken || !contractAddress) return;
    writeContract({
      address: collateralToken,
      abi: ERC20_ABI,
      chainId: CHAIN_ID,
      functionName: 'approve',
      args: [contractAddress, maxUint256],
    });
  };

  const submitMint = () => {
    if (!baseContract || entropyFee == null) return;
    const refCode = codeInput.trim()
      ? encodeCode(codeInput)
      : (('0x' + '00'.repeat(32)) as Hex);
    if (!refCode) {
      setStatusMsg('Ref code too long (max 32 bytes).');
      return;
    }
    setStatusMsg('Submitting mint…');
    // 2x current Pyth fee as a buffer against fee ticking up between read+send.
    // The contract refunds excess in `mintCard`.
    writeContract({
      ...baseContract,
      functionName: 'mintCard',
      args: [refCode],
      value: entropyFee * 2n,
    });
  };

  const injected = connectors.find((c) => c.id === 'injected');

  return (
    <main>
      <Nav />
      <header className="header">
        <div className="title-block">
          <h1>BingoCard — Mint</h1>
        </div>
      </header>

      <section className="screen admin-section">
        <div>
          <h2>Contract address</h2>
        </div>
        <div className="admin-row">
          <input
            className="admin-input"
            placeholder="0x…"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value.trim())}
          />
          <button
            type="button"
            className="primary"
            disabled={!isAddress(addressInput)}
            onClick={saveAddress}
          >
            Save
          </button>
        </div>
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
          <p className="muted small">Wallet: {shortAddress(eoa)}</p>
        )}
      </section>

      <section className="screen admin-section">
        <h2>Mint a card</h2>
        <div className="admin-kv">
          <div>Card price</div>
          <div className="mono">{fmtUnits(cardPrice)}</div>
          <div>Entropy fee (wei)</div>
          <div className="mono">{entropyFee?.toString() ?? '—'}</div>
          <div>Pool size</div>
          <div className="mono">{poolSize?.toString() ?? '—'}</div>
          <div>Your balance</div>
          <div className="mono">{fmtUnits(balance)}</div>
          <div>Allowance</div>
          <div className="mono">{fmtUnits(allowance)}</div>
        </div>

        {multipliers && cardPrice != null && (
          <div className="admin-action">
            <div className="wizard-step-title">Bonus prize curve</div>
            <p className="muted small">
              Paid out by <span className="mono">claimBonus</span> once all 10
              lines are funded — payout = cardPrice × multiplier ÷ 10000.
            </p>
            <div className="admin-kv">
              {multipliers.map((bps, i) => (
                <Fragment key={i}>
                  <div>
                    {i} winning {i === 1 ? 'line' : 'lines'}
                  </div>
                  <div className="mono">
                    {bps === 0
                      ? '—'
                      : `${(bps / 10_000).toFixed(2)}× (${fmtUnits(
                          (cardPrice * BigInt(bps)) / 10_000n,
                        )})`}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        )}

        <div className="admin-action">
          <div className="wizard-step-title">Referral code (optional)</div>
          <div className="admin-row">
            <input
              className="admin-input"
              placeholder="e.g. NOAH or leave blank"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
          </div>
        </div>

        <div className="admin-row">
          <button
            type="button"
            className="ghost"
            disabled={!needsApproval || writePending || !contractAddress}
            onClick={submitApprove}
          >
            {needsApproval ? 'Approve collateral' : 'Approved ✓'}
          </button>
          <button
            type="button"
            className="primary"
            disabled={
              writePending ||
              txLoading ||
              !contractAddress ||
              needsApproval ||
              entropyFee == null
            }
            onClick={submitMint}
          >
            {writePending || txLoading ? 'Submitting…' : 'Mint card'}
          </button>
        </div>
        {writeError && <p className="error">{writeError.message}</p>}
        {statusMsg && <p className="muted small">{statusMsg}</p>}
      </section>

    </main>
  );
}
