import { useMemo, useState } from 'react';
import { isAddress, type Address } from 'viem';
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  BINGO_CARD_ABI,
  CHAIN_ID,
  encodeCode,
  fmtUnits,
  loadContractAddress,
  saveContractAddress,
  shortAddress,
} from '../lib/bingoCard';
import Nav from '../components/Nav';

export default function ReferScreen() {
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

  const [codeInput, setCodeInput] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const {
    writeContract,
    isPending: writePending,
    error: writeError,
    data: lastTxHash,
  } = useWriteContract();
  const { isLoading: txLoading } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    chainId: CHAIN_ID,
  });

  // Look up the owner of the entered code so the user can tell if it's taken.
  const encodedCode = codeInput.trim() ? encodeCode(codeInput) : null;
  const codeOwnerRead = useReadContract({
    ...(baseContract ?? {}),
    address: baseContract?.address,
    abi: baseContract?.abi,
    chainId: baseContract?.chainId,
    functionName: 'referrerOf',
    args: encodedCode ? [encodedCode] : undefined,
    query: { enabled: !!baseContract && !!encodedCode },
  });
  const codeOwner = codeOwnerRead.data as Address | undefined;
  const codeIsFree =
    codeOwner === '0x0000000000000000000000000000000000000000';
  const codeIsMine =
    eoa && codeOwner && codeOwner.toLowerCase() === eoa.toLowerCase();

  // Earnings balance for the connected EOA.
  const earningsRead = useReadContract({
    ...(baseContract ?? {}),
    address: baseContract?.address,
    abi: baseContract?.abi,
    chainId: baseContract?.chainId,
    functionName: 'referralEarnings',
    args: eoa ? [eoa] : undefined,
    query: { enabled: !!baseContract && !!eoa },
  });
  const earnings = earningsRead.data as bigint | undefined;

  const saveAddress = () => {
    if (!isAddress(addressInput)) return;
    saveContractAddress(addressInput);
  };

  const submitRegister = () => {
    if (!baseContract || !encodedCode) return;
    setStatusMsg(null);
    writeContract({
      ...baseContract,
      functionName: 'registerCode',
      args: [encodedCode],
    });
  };

  const submitClaim = () => {
    if (!baseContract) return;
    const to = isAddress(recipientInput)
      ? (recipientInput as Address)
      : eoa;
    if (!to) {
      setStatusMsg('Connect wallet or enter a recipient address.');
      return;
    }
    writeContract({
      ...baseContract,
      functionName: 'claimReferralEarnings',
      args: [to],
    });
  };

  const injected = connectors.find((c) => c.id === 'injected');

  return (
    <main>
      <Nav />
      <header className="header">
        <div className="title-block">
          <h1>BingoCard — Refer</h1>
        </div>
      </header>

      <section className="screen admin-section">
        <h2>Contract address</h2>
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
        <h2>Create a code</h2>
        <p className="muted small">
          First-come-first-served. When someone mints a card with your code and
          fills all 10 lines, you earn the configured referral bps cut.
        </p>
        <div className="admin-row">
          <input
            className="admin-input"
            placeholder="e.g. NOAH"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
          />
        </div>
        {codeInput.trim() && (
          <div className="admin-kv">
            <div>Encoded</div>
            <div className="mono small">{encodedCode ?? '— (too long)'}</div>
            <div>Current owner</div>
            <div className="mono">
              {codeOwner == null
                ? '—'
                : codeIsFree
                  ? 'available'
                  : codeIsMine
                    ? 'you'
                    : shortAddress(codeOwner)}
            </div>
          </div>
        )}
        <div className="admin-row">
          <button
            type="button"
            className="primary"
            disabled={
              writePending ||
              txLoading ||
              !baseContract ||
              !encodedCode ||
              !codeIsFree
            }
            onClick={submitRegister}
          >
            {writePending || txLoading
              ? 'Submitting…'
              : codeIsMine
                ? 'You own this code'
                : codeIsFree
                  ? 'Register code'
                  : 'Code taken'}
          </button>
        </div>
      </section>

      <section className="screen admin-section">
        <h2>Claim earnings</h2>
        <div className="admin-kv">
          <div>Your balance</div>
          <div className="mono">{fmtUnits(earnings)}</div>
        </div>
        <div className="admin-action">
          <div className="wizard-step-title">Recipient (optional)</div>
          <p className="muted small">
            Defaults to your connected wallet if left blank.
          </p>
          <div className="admin-row">
            <input
              className="admin-input"
              placeholder="0x…"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value.trim())}
            />
          </div>
        </div>
        <div className="admin-row">
          <button
            type="button"
            className="primary"
            disabled={
              writePending ||
              txLoading ||
              !baseContract ||
              !earnings ||
              earnings === 0n
            }
            onClick={submitClaim}
          >
            {writePending || txLoading ? 'Submitting…' : 'Claim earnings'}
          </button>
        </div>
        {writeError && <p className="error">{writeError.message}</p>}
        {statusMsg && <p className="muted small">{statusMsg}</p>}
      </section>
    </main>
  );
}
