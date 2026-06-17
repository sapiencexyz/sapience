import { useMemo, useState } from 'react';
import { onboardingSponsor as sponsorAddresses } from '@sapience/sdk/contracts';
import { parseAbi, type Address, type Hex } from 'viem';
import { useReadContract } from 'wagmi';
import {
  grantAfterPreview,
  remainingOf,
  resolveGrantTarget,
  validateGrantAmountUsde,
  walletCanGrant,
} from '../lib/adminSponsorship';
import { fmtUnits, shortAddress } from '../lib/format/balance';
import { CHAIN_ID } from '../lib/chain';
import type { SponsorshipsResponse } from '../lib/backendApi';

const SPONSOR_ABI = parseAbi([
  'function setBudget(address beneficiary, uint256 allocated)',
  'function budgets(address beneficiary) view returns (uint256 allocated, uint256 used)',
  'function budgetManager() view returns (address)',
  'function owner() view returns (address)',
]);

function wei(v: string | null | undefined): bigint | undefined {
  if (v == null) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export default function AdminSponsorshipSection({
  sponsorships,
  loading,
  loadError,
  onReload,
  isConnected,
  connectedAddress,
  writePending,
  writeContractAsync,
  onGrantError,
}: {
  sponsorships: SponsorshipsResponse | null;
  loading: boolean;
  loadError: string | null;
  onReload: () => void;
  isConnected: boolean;
  connectedAddress?: Address;
  writePending: boolean;
  writeContractAsync: (args: {
    address: Address;
    abi: typeof SPONSOR_ABI;
    chainId: number;
    functionName: 'setBudget';
    args: readonly [Address, bigint];
  }) => Promise<Hex>;
  onGrantError: (message: string | null) => void;
}) {
  const sponsor = sponsorAddresses[CHAIN_ID]?.address as Address | undefined;

  const [playerInput, setPlayerInput] = useState('');
  const [useAsSmartAccount, setUseAsSmartAccount] = useState(false);
  const [amountUsde, setAmountUsde] = useState('');
  const [copied, setCopied] = useState(false);
  const [granting, setGranting] = useState(false);

  const grantTarget = useMemo(
    () => resolveGrantTarget(playerInput, useAsSmartAccount),
    [playerInput, useAsSmartAccount],
  );

  const amountParsed = useMemo(
    () => validateGrantAmountUsde(amountUsde),
    [amountUsde],
  );

  const { data: budgetManager } = useReadContract({
    address: sponsor,
    abi: SPONSOR_ABI,
    functionName: 'budgetManager',
    chainId: CHAIN_ID,
    query: { enabled: !!sponsor },
  });

  const { data: sponsorOwner } = useReadContract({
    address: sponsor,
    abi: SPONSOR_ABI,
    functionName: 'owner',
    chainId: CHAIN_ID,
    query: { enabled: !!sponsor },
  });

  const { data: liveBudget, refetch: refetchBudget } = useReadContract({
    address: sponsor,
    abi: SPONSOR_ABI,
    functionName: 'budgets',
    args: grantTarget ? [grantTarget] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!sponsor && !!grantTarget },
  });

  const currentBudget = useMemo(() => {
    if (!liveBudget) return { allocated: 0n, used: 0n };
    const [allocated, used] = liveBudget;
    return { allocated, used };
  }, [liveBudget]);

  const afterBudget =
    amountParsed.ok === true
      ? grantAfterPreview(currentBudget, amountParsed.wei)
      : null;

  const canGrant = walletCanGrant(
    connectedAddress,
    budgetManager as Address | undefined,
    sponsorOwner as Address | undefined,
  );

  const grantDisabledReason = !sponsor
    ? 'Sponsor not configured on this network'
    : !isConnected
      ? 'Connect the grant wallet'
      : !canGrant
        ? 'Connected wallet is not budgetManager or sponsor owner'
        : !grantTarget
          ? 'Enter a valid player wallet'
          : amountParsed.ok === false
            ? amountParsed.error
            : null;

  const submitGrant = async () => {
    if (!sponsor || !grantTarget || amountParsed.ok !== true || grantDisabledReason) {
      return;
    }
    onGrantError(null);
    setGranting(true);
    try {
      await writeContractAsync({
        address: sponsor,
        abi: SPONSOR_ABI,
        chainId: CHAIN_ID,
        functionName: 'setBudget',
        args: [grantTarget, amountParsed.wei],
      });
      await refetchBudget();
      onReload();
    } catch (e) {
      onGrantError(e instanceof Error ? e.message : String(e));
    } finally {
      setGranting(false);
    }
  };

  const copySponsorAddress = async () => {
    const addr = sponsorships?.sponsorAddress ?? sponsor;
    if (!addr) return;
    await copyText(addr);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="screen admin-section">
      <h2>Sponsorships</h2>
      <p className="muted small">
        Grant sponsored-card budgets to player smart accounts. Sign in above to
        load history; connect the grant wallet to submit on-chain grants.
      </p>

      {loadError && <p className="error small">{loadError}</p>}

      {!sponsorships && !loading && (
        <p className="muted small">Sign in and load to view sponsorship data.</p>
      )}

      {loading && !sponsorships && (
        <p className="muted small">Loading sponsorships…</p>
      )}

      {sponsorships && (
        <>
          <div className="admin-kv">
            <div>Bankroll</div>
            <div className="mono">{fmtUnits(wei(sponsorships.bankrollWei))} USDe</div>
            <div>Sponsor contract</div>
            <div className="mono small admin-sponsor-address">
              {sponsorships.sponsorAddress ?? '—'}
              {sponsorships.sponsorAddress && (
                <button
                  type="button"
                  className="ghost admin-copy-btn"
                  onClick={() => void copySponsorAddress()}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
          <p className="muted small">
            Send wUSDe to this address to add funds.
          </p>

          <div className="admin-grant-form">
            <label className="field">
              <span className="label">Player wallet (EOA)</span>
              <input
                className="admin-input"
                type="text"
                placeholder="0x…"
                value={playerInput}
                onChange={(e) => setPlayerInput(e.target.value)}
              />
            </label>
            <p className="muted small">
              Paste an EOA — if you have the smart account, tick the override
              below.
            </p>

            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={useAsSmartAccount}
                onChange={(e) => setUseAsSmartAccount(e.target.checked)}
              />
              Use address as-is (smart account)
            </label>

            <div className="admin-kv">
              <div>Grant target (smart account)</div>
              <div className="mono small">
                {grantTarget ? grantTarget : '—'}
              </div>
            </div>

            <label className="field">
              <span className="label">
                New total allocation — USDe, multiples of 10
              </span>
              <input
                className="admin-input"
                type="text"
                inputMode="decimal"
                placeholder="10"
                value={amountUsde}
                onChange={(e) => setAmountUsde(e.target.value)}
              />
            </label>
            <p className="muted small">
              Overwrites the current allocation — it does not add to it. To top
              up, enter the new total (used stays unchanged).
            </p>

            {grantTarget && (
              <div className="admin-kv admin-grant-preview">
                <div>Current</div>
                <div className="mono small">
                  allocated {fmtUnits(currentBudget.allocated)} · used{' '}
                  {fmtUnits(currentBudget.used)} · remaining{' '}
                  {fmtUnits(remainingOf(currentBudget))} USDe
                </div>
                {afterBudget && (
                  <>
                    <div>After grant</div>
                    <div className="mono small">
                      allocated {fmtUnits(afterBudget.allocated)} · used{' '}
                      {fmtUnits(afterBudget.used)} · remaining{' '}
                      {fmtUnits(remainingOf(afterBudget))} USDe
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="admin-row">
              <button
                type="button"
                className="primary"
                disabled={
                  writePending ||
                  granting ||
                  !!grantDisabledReason
                }
                title={grantDisabledReason ?? undefined}
                onClick={() => void submitGrant()}
              >
                {granting || writePending ? 'Signing…' : 'Grant budget'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={loading}
                onClick={onReload}
              >
                {loading ? 'Refreshing…' : 'Refresh history'}
              </button>
            </div>
            {grantDisabledReason && isConnected && (
              <p className="muted small">{grantDisabledReason}</p>
            )}
          </div>

          {sponsorships.rows.length === 0 && (
            <p className="muted small">No bingo admin grants yet.</p>
          )}

          {sponsorships.rows.length > 0 && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Grant target</th>
                    <th className="num">Allocated</th>
                    <th className="num">Used</th>
                    <th className="num">Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sponsorships.rows.map((row) => {
                    const allocated = wei(row.allocatedWei) ?? 0n;
                    const used = wei(row.usedWei) ?? 0n;
                    return (
                      <tr key={row.smartAccount}>
                        <td className="mono" title={row.smartAccount}>
                          {shortAddress(row.smartAccount)}
                        </td>
                        <td className="mono num">
                          {fmtUnits(allocated)}
                        </td>
                        <td className="mono num">{fmtUnits(used)}</td>
                        <td className="mono num">
                          {fmtUnits(wei(row.remainingWei))}
                        </td>
                        <td className="mono">
                          {fmtUnits(used)} / {fmtUnits(allocated)} USDe{' '}
                          {row.played ? '✓ played' : '— unused'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
