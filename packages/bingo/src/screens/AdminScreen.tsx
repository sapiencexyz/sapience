import { useEffect, useMemo, useState } from 'react';
import { formatUnits, isAddress, parseUnits, type Address } from 'viem';
import {
  useAccount,
  useConnect,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import {
  BINGO_CARD_ABI,
  ERC20_ABI,
  loadContractAddress,
  saveContractAddress,
} from '../lib/bingoCard';
import { fetchConditions, type BingoCondition } from '../api';

const CHAIN_ID = CHAIN_ID_ETHEREAL;
const DECIMALS = 18;

function shortAddress(a?: string | null): string {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUnits(v: bigint | undefined): string {
  if (v == null) return '—';
  return formatUnits(v, DECIMALS);
}

export default function AdminScreen() {
  const { address: eoa, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();

  const [addressInput, setAddressInput] = useState<string>(
    loadContractAddress() ?? '',
  );
  const contractAddress: Address | null = useMemo(() => {
    return isAddress(addressInput) ? (addressInput as Address) : null;
  }, [addressInput]);

  const baseContract = contractAddress
    ? { address: contractAddress, abi: BINGO_CARD_ABI, chainId: CHAIN_ID }
    : null;

  // ---------- reads ----------
  const reads = useReadContracts({
    contracts: baseContract
      ? [
          { ...baseContract, functionName: 'owner' },
          { ...baseContract, functionName: 'collateralToken' },
          { ...baseContract, functionName: 'poolVersion' },
          { ...baseContract, functionName: 'poolSize' },
          { ...baseContract, functionName: 'cardPrice' },
          { ...baseContract, functionName: 'perLineStake' },
          { ...baseContract, functionName: 'referralBps' },
          { ...baseContract, functionName: 'cardExpirySeconds' },
          { ...baseContract, functionName: 'bonusPool' },
        ]
      : [],
    query: { enabled: !!baseContract },
  });

  const owner = reads.data?.[0]?.result as Address | undefined;
  const collateralToken = reads.data?.[1]?.result as Address | undefined;
  const poolVersion = reads.data?.[2]?.result as number | undefined;
  const poolSize = reads.data?.[3]?.result as bigint | undefined;
  const cardPrice = reads.data?.[4]?.result as bigint | undefined;
  const perLineStake = reads.data?.[5]?.result as bigint | undefined;
  const referralBps = reads.data?.[6]?.result as number | undefined;
  const cardExpirySeconds = reads.data?.[7]?.result as bigint | undefined;
  const bonusPool = reads.data?.[8]?.result as bigint | undefined;

  const isOwner =
    !!owner && !!eoa && owner.toLowerCase() === eoa.toLowerCase();

  // ---------- writes ----------
  const { writeContract, isPending: writePending, error: writeError } =
    useWriteContract();

  // form state
  const [priceInput, setPriceInput] = useState('');
  const [bpsInput, setBpsInput] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [depositInput, setDepositInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<BingoCondition[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BingoCondition[]>([]);
  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [
    selected,
  ]);

  const saveAddress = () => {
    if (!isAddress(addressInput)) return;
    saveContractAddress(addressInput);
  };

  const submitPrice = () => {
    if (!baseContract) return;
    const v = parseUnits(priceInput || '0', DECIMALS);
    writeContract({ ...baseContract, functionName: 'setCardPrice', args: [v] });
  };

  const submitBps = () => {
    if (!baseContract) return;
    const n = Number(bpsInput);
    if (!Number.isInteger(n) || n < 0 || n > 10_000) return;
    writeContract({ ...baseContract, functionName: 'setReferralBps', args: [n] });
  };

  const submitExpiry = () => {
    if (!baseContract) return;
    const n = BigInt(expiryInput || '0');
    writeContract({ ...baseContract, functionName: 'setCardExpiry', args: [n] });
  };

  const submitDeposit = () => {
    if (!baseContract) return;
    const v = parseUnits(depositInput || '0', DECIMALS);
    writeContract({ ...baseContract, functionName: 'depositBonus', args: [v] });
  };

  const submitApprove = () => {
    if (!baseContract || !collateralToken) return;
    const v = parseUnits(depositInput || '0', DECIMALS);
    writeContract({
      address: collateralToken,
      abi: ERC20_ABI,
      chainId: CHAIN_ID,
      functionName: 'approve',
      args: [baseContract.address, v],
    });
  };

  const submitWithdraw = () => {
    if (!baseContract) return;
    if (!isAddress(withdrawTo)) return;
    const v = parseUnits(withdrawInput || '0', DECIMALS);
    writeContract({
      ...baseContract,
      functionName: 'withdrawBonus',
      args: [v, withdrawTo as Address],
    });
  };

  // Debounce search input.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Fetch conditions on debounced search change.
  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    fetchConditions({ search: debouncedSearch, take: 50 })
      .then((rows) => {
        if (cancelled) return;
        setSearchResults(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setSearchError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const addCondition = (c: BingoCondition) => {
    setSelected((prev) =>
      prev.some((p) => p.id === c.id) ? prev : [...prev, c],
    );
  };

  const removeCondition = (id: string) => {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  };

  const submitPool = () => {
    if (!baseContract || selected.length === 0) return;
    const ids = selected.map((c) => c.id as `0x${string}`);
    const resolvers = selected.map((c) => c.resolver);
    writeContract({
      ...baseContract,
      functionName: 'setPool',
      args: [ids, resolvers],
    });
  };

  const injected = connectors.find((c) => c.id === 'injected');

  return (
    <main>
      <header className="header">
        <div className="title-block">
          <h1>BingoCard Admin</h1>
        </div>
      </header>

      <section className="screen admin-section">
        <div>
          <h2>Contract address</h2>
          <p className="muted small">
            Stored in localStorage. Reads/writes target chainId {CHAIN_ID}.
          </p>
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
          <p className="muted small">
            Wallet: {shortAddress(eoa)} ·{' '}
            {isOwner ? 'is owner ✓' : 'NOT owner — writes will revert'}
          </p>
        )}
      </section>

      <section className="screen admin-section">
        <h2>State</h2>
        <div className="admin-kv">
            <div>Owner</div><div className="mono">{shortAddress(owner)}</div>
            <div>Collateral token</div><div className="mono">{shortAddress(collateralToken)}</div>
            <div>Pool version</div><div className="mono">{poolVersion ?? '—'}</div>
            <div>Pool size</div><div className="mono">{poolSize?.toString() ?? '—'}</div>
            <div>Card price</div><div className="mono">{fmtUnits(cardPrice)}</div>
            <div>Per-line stake (derived)</div><div className="mono">{fmtUnits(perLineStake)}</div>
            <div>Referral bps</div><div className="mono">{referralBps ?? '—'}</div>
            <div>Card expiry (s)</div><div className="mono">{cardExpirySeconds?.toString() ?? '—'}</div>
            <div>Bonus pool</div><div className="mono">{fmtUnits(bonusPool)}</div>
          </div>
        </section>

        <section className="screen admin-section">
          <h2>Actions</h2>
          {writeError && <p className="error">{writeError.message}</p>}

          <div className="admin-action">
            <div className="wizard-step-title">Set card price</div>
            <p className="muted small">
              In tokens (18 dec). e.g. 5 = $5.00. Per-line stake auto-derives as price ÷ 10.
            </p>
            <div className="admin-row">
              <input
                className="admin-input"
                placeholder="5"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={writePending || !priceInput || !baseContract}
                onClick={submitPrice}
              >
                Submit
              </button>
            </div>
          </div>

          <div className="admin-action">
            <div className="wizard-step-title">Set referral bps</div>
            <p className="muted small">Integer 0–10000. e.g. 200 = 2%.</p>
            <div className="admin-row">
              <input
                className="admin-input"
                placeholder="200"
                value={bpsInput}
                onChange={(e) => setBpsInput(e.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={writePending || !bpsInput || !baseContract}
                onClick={submitBps}
              >
                Submit
              </button>
            </div>
          </div>

          <div className="admin-action">
            <div className="wizard-step-title">Set card expiry (seconds)</div>
            <p className="muted small">
              Time from mint until withdrawUnused is allowed.
            </p>
            <div className="admin-row">
              <input
                className="admin-input"
                placeholder="2592000"
                value={expiryInput}
                onChange={(e) => setExpiryInput(e.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={writePending || !expiryInput || !baseContract}
                onClick={submitExpiry}
              >
                Submit
              </button>
            </div>
          </div>

          <div className="admin-action">
            <div className="wizard-step-title">Set pool</div>
            <p className="muted small">
              Search live unresolved conditions and add them to the pool. The
              selected set replaces the on-chain pool when submitted.
            </p>
            <div className="admin-row">
              <input
                className="admin-input"
                placeholder="Search conditions (e.g. World Cup, Bitcoin)…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <div className="pool-results">
              {searchError && <p className="error">{searchError}</p>}
              {!searchError && searchResults.length === 0 && !searching && (
                <p className="muted small">No matches.</p>
              )}
              {searching && (
                <p className="muted small">Searching…</p>
              )}
              {searchResults.map((c) => {
                const added = selectedIds.has(c.id);
                return (
                  <div key={c.id} className="pool-row">
                    <div className="pool-row-text">
                      <div className="pool-row-q">
                        {c.groupName && c.optionName
                          ? `${c.groupName} — ${c.optionName}`
                          : c.shortName?.trim() || c.question}
                      </div>
                      <div className="muted small">
                        p ≈ {(c.estimatedPrice * 100).toFixed(0)}%
                      </div>
                    </div>
                    <button
                      type="button"
                      className={added ? 'ghost' : 'primary'}
                      onClick={() =>
                        added ? removeCondition(c.id) : addCondition(c)
                      }
                    >
                      {added ? 'Remove' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pool-selected">
              <div className="wizard-step-title">
                Selected ({selected.length})
              </div>
              {selected.length === 0 && (
                <p className="muted small">Nothing selected yet.</p>
              )}
              {selected.map((c) => (
                <div key={c.id} className="pool-row">
                  <div className="pool-row-text">
                    <div className="pool-row-q">
                      {c.groupName && c.optionName
                        ? `${c.groupName} — ${c.optionName}`
                        : c.shortName?.trim() || c.question}
                    </div>
                    <div className="muted small">
                      p ≈ {(c.estimatedPrice * 100).toFixed(0)}%
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => removeCondition(c.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="admin-row">
              <button
                type="button"
                className="primary"
                disabled={
                  writePending ||
                  selected.length < 16 ||
                  !baseContract
                }
                onClick={submitPool}
              >
                Submit on-chain ({selected.length})
              </button>
              {selected.length < 16 && selected.length > 0 && (
                <span className="muted small">
                  Need at least 16 for the contract minimum.
                </span>
              )}
            </div>
          </div>

          <div className="admin-action">
            <div className="wizard-step-title">Deposit bonus</div>
            <p className="muted small">
              Approve the contract on the collateral token, then deposit.
            </p>
            <div className="admin-row">
              <input
                className="admin-input"
                placeholder="100"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
              />
              <button
                type="button"
                className="ghost"
                disabled={
                  writePending ||
                  !depositInput ||
                  !collateralToken ||
                  !baseContract
                }
                onClick={submitApprove}
              >
                Approve
              </button>
              <button
                type="button"
                className="primary"
                disabled={writePending || !depositInput || !baseContract}
                onClick={submitDeposit}
              >
                Deposit
              </button>
            </div>
          </div>

          <div className="admin-action">
            <div className="wizard-step-title">Withdraw bonus</div>
            <div className="admin-row">
              <input
                className="admin-input"
                placeholder="amount (e.g. 50)"
                value={withdrawInput}
                onChange={(e) => setWithdrawInput(e.target.value)}
              />
              <input
                className="admin-input"
                placeholder="recipient 0x…"
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value.trim())}
              />
              <button
                type="button"
                className="primary"
                disabled={
                  writePending ||
                  !withdrawInput ||
                  !isAddress(withdrawTo) ||
                  !baseContract
                }
                onClick={submitWithdraw}
              >
                Submit
              </button>
            </div>
          </div>
        </section>
    </main>
  );
}
