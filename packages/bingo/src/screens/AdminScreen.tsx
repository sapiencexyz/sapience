import { useEffect, useState } from 'react';
import { parseAbi, type Address } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import {
  useAccount,
  useConnect,
  useSignMessage,
  useWriteContract,
} from 'wagmi';
import { collateralToken as collateralAddresses } from '@sapience/sdk/contracts';
import { fmtUnits, shortAddress } from '../lib/format/balance';
import { CHAIN_ID } from '../lib/chain';
import {
  fetchAdminNonce,
  fetchEntitlements,
  fetchPool,
  postAdminLogin,
  type EntitlementsResponse,
  type PoolResponse,
} from '../lib/backendApi';
import Nav from '../components/Nav';

const RECEIPT_ABI = parseAbi([
  'function payBonus(uint256 tokenId, uint8 wins, uint256 amount)',
  'function payReferral(uint256 tokenId, uint256 amount)',
]);

const ERC20_APPROVE_ABI = parseAbi([
  'function approve(address spender, uint256 value) returns (bool)',
]);

const ADMIN_TOKEN_STORAGE_KEY = 'bingo-admin-token';

function loadAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
}

function wei(v: string | null | undefined): bigint | undefined {
  if (v == null) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

export default function AdminScreen() {
  const { address: eoa, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [pool, setPool] = useState<PoolResponse | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);

  const [token, setToken] = useState<string>(loadAdminToken);
  const [signingIn, setSigningIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | null>(
    null
  );

  // SIWE: prove control of the treasury wallet (the receipt contract owner)
  // and receive a short-lived bearer token for the admin endpoints.
  const signInWithWallet = async () => {
    if (!eoa) return;
    setLoadError(null);
    setSigningIn(true);
    try {
      const { nonce } = await fetchAdminNonce();
      const message = createSiweMessage({
        domain: window.location.host,
        address: eoa,
        statement: 'Sign in to the COMBO.BINGO admin.',
        uri: window.location.origin,
        version: '1',
        chainId: CHAIN_ID,
        nonce,
      });
      const signature = await signMessageAsync({ message });
      const session = await postAdminLogin(message, signature);
      setToken(session.token);
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, session.token);
      setEntitlements(await fetchEntitlements(session.token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningIn(false);
    }
  };

  useEffect(() => {
    let stop = false;
    fetchPool()
      .then((p) => {
        if (!stop) setPool(p);
      })
      .catch((e) => {
        if (!stop) setPoolError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stop = true;
    };
  }, []);

  const loadEntitlements = async () => {
    const t = token.trim();
    if (!t) return;
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, t);
    setLoading(true);
    setLoadError(null);
    try {
      setEntitlements(await fetchEntitlements(t));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // ---- treasury payouts (on-chain, signed by the connected wallet) ----

  const { writeContractAsync, isPending: writePending } = useWriteContract();
  const [payError, setPayError] = useState<string | null>(null);
  const collateral = collateralAddresses[CHAIN_ID]?.address as
    | Address
    | undefined;

  const approveTreasury = async () => {
    if (!pool?.receiptContract || !collateral) return;
    setPayError(null);
    try {
      await writeContractAsync({
        address: collateral,
        abi: ERC20_APPROVE_ABI,
        chainId: CHAIN_ID,
        functionName: 'approve',
        args: [pool.receiptContract, (1n << 255n) - 1n],
      });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    }
  };

  const payBonus = async (tokenId: string, wins: number, amountWei: string) => {
    if (!pool?.receiptContract) return;
    setPayError(null);
    try {
      await writeContractAsync({
        address: pool.receiptContract,
        abi: RECEIPT_ABI,
        chainId: CHAIN_ID,
        functionName: 'payBonus',
        args: [BigInt(tokenId), wins, BigInt(amountWei)],
      });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    }
  };

  const payReferral = async (tokenId: string, amountWei: string) => {
    if (!pool?.receiptContract) return;
    setPayError(null);
    try {
      await writeContractAsync({
        address: pool.receiptContract,
        abi: RECEIPT_ABI,
        chainId: CHAIN_ID,
        functionName: 'payReferral',
        args: [BigInt(tokenId), BigInt(amountWei)],
      });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main>
      <Nav />
      <header className="header">
        <div className="title-block">
          <h1>COMBO.BINGO Admin</h1>
        </div>
      </header>

      <section className="screen admin-section">
        <h2>Pool</h2>
        {poolError && <p className="error small">{poolError}</p>}
        {!pool && !poolError && <p className="muted small">Loading pool…</p>}
        {pool && (
          <div className="admin-kv">
            <div>Pool id</div>
            <div className="mono">{pool.poolId}</div>
            <div>Cutoff</div>
            <div className="mono">
              {new Date(pool.cutoff * 1000).toLocaleString()}
              {pool.open ? ' (open)' : ' (closed)'}
            </div>
            <div>Conditions</div>
            <div className="mono">{pool.conditions.length}</div>
            <div>Min card price</div>
            <div className="mono">{fmtUnits(wei(pool.minCardPriceWei))}</div>
            <div>Referral bps</div>
            <div className="mono">{pool.referralBps}</div>
            <div>Multipliers (bps)</div>
            <div className="mono">{pool.multiplierBps.join(', ')}</div>
            <div>Fairness commitment</div>
            <div className="mono small">{pool.fairnessCommitment}</div>
          </div>
        )}
      </section>

      <section className="screen admin-section">
        <h2>Entitlements & payouts</h2>
        <p className="muted small">
          Sign in with the treasury wallet (the receipt contract owner) to view
          what's owed and pay it on-chain through the receipt NFT.
        </p>
        <div className="admin-row">
          {!isConnected && (
            <button
              type="button"
              className="primary"
              disabled={connectPending}
              onClick={() => {
                const injected = connectors.find((c) => c.id === 'injected');
                if (injected) connect({ connector: injected });
              }}
            >
              {connectPending ? 'Opening wallet…' : 'Connect wallet'}
            </button>
          )}
          {isConnected && (
            <button
              type="button"
              className="primary"
              disabled={signingIn}
              onClick={signInWithWallet}
            >
              {signingIn ? 'Signing in…' : `Sign in as ${shortAddress(eoa)}`}
            </button>
          )}
          <input
            className="admin-input"
            type="password"
            placeholder="…or static admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            type="button"
            className="ghost"
            disabled={loading || !token.trim()}
            onClick={loadEntitlements}
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {loadError && <p className="error small">{loadError}</p>}
        {payError && <p className="error small">{payError}</p>}
        {pool?.receiptContract && entitlements && (
          <div className="admin-row">
            <button
              type="button"
              className="ghost"
              disabled={writePending || !isConnected}
              onClick={approveTreasury}
            >
              Approve treasury spend (one-time)
            </button>
          </div>
        )}

        {entitlements && (
          <>
            <div className="admin-kv">
              <div>Total bonus owed</div>
              <div className="mono">
                {fmtUnits(wei(entitlements.totalBonusOwedWei))}
              </div>
              <div>Total referral owed</div>
              <div className="mono">
                {fmtUnits(wei(entitlements.totalReferralOwedWei))}
              </div>
              <div>Cards</div>
              <div className="mono">{entitlements.rows.length}</div>
            </div>

            {entitlements.rows.length === 0 && (
              <p className="muted small">No cards submitted yet.</p>
            )}
            {entitlements.rows.length > 0 &&
              (() => {
                /* Re-rolls are self-documenting (sequential receipts), so a
                   funded card sitting above abandoned indexes is the
                   layout-grinder fingerprint — flag the player for review
                   before paying their bonus. */
                const byPlayer = entitlements.rows.reduce<
                  Record<string, typeof entitlements.rows>
                >((acc, r) => {
                  const k = `${r.player}:${r.poolId}`;
                  (acc[k] ??= []).push(r);
                  return acc;
                }, {});
                const grinders = new Set(
                  Object.values(byPlayer)
                    .filter((rows) =>
                      rows.some(
                        (r) =>
                          r.linesFunded > 0 &&
                          rows.some(
                            (o) =>
                              o.cardIndex < r.cardIndex && o.linesFunded === 0
                          )
                      )
                    )
                    .map((rows) => rows[0].player)
                );
                const sorted = [...entitlements.rows].sort(
                  (a, b) =>
                    a.player.localeCompare(b.player) ||
                    a.poolId.localeCompare(b.poolId) ||
                    a.cardIndex - b.cardIndex
                );
                return (
                  <>
                    {grinders.size > 0 && (
                      <p className="error small">
                        ⚠ {[...grinders].map(shortAddress).join(', ')}: funded
                        card above abandoned indexes (re-roll pattern) — review
                        before paying.
                      </p>
                    )}
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Card</th>
                            <th className="num">Price</th>
                            <th className="num">Lines</th>
                            <th className="num">Wins</th>
                            <th>Decided</th>
                            <th className="num">Bonus owed</th>
                            <th>Referrer</th>
                            <th className="num">Referral owed</th>
                            <th>Pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((r) => (
                            <tr
                              key={`${r.player}:${r.poolId}:${r.cardIndex}`}
                              className={
                                grinders.has(r.player)
                                  ? 'admin-table-flagged'
                                  : undefined
                              }
                            >
                              <td className="mono">
                                {grinders.has(r.player) && (
                                  <span title="Re-roll pattern — review before paying">
                                    ⚠{' '}
                                  </span>
                                )}
                                {shortAddress(r.player)}
                              </td>
                              <td className="mono">#{r.cardIndex + 1}</td>
                              <td className="mono num">
                                {fmtUnits(wei(r.cardPriceWei))}
                              </td>
                              <td
                                className="mono num"
                                title={r.complete ? 'complete' : 'incomplete'}
                              >
                                {r.linesFunded}/10{r.complete ? '' : ' ⚠'}
                              </td>
                              <td className="mono num">{r.wins ?? '—'}</td>
                              <td
                                className="mono"
                                title={
                                  r.decided === false
                                    ? 'Owed can still grow'
                                    : undefined
                                }
                              >
                                {r.decided == null
                                  ? '—'
                                  : r.decided
                                    ? 'yes'
                                    : 'open'}
                              </td>
                              <td className="mono num">
                                {fmtUnits(wei(r.bonusOwedWei))}
                                {r.bonusPaidOnChain ? ' ✓' : ''}
                              </td>
                              <td className="mono">{shortAddress(r.ref)}</td>
                              <td className="mono num">
                                {fmtUnits(wei(r.referralOwedWei))}
                                {r.referralPaidOnChain ? ' ✓' : ''}
                              </td>
                              <td>
                                <div className="admin-table-actions">
                                  {r.receiptTokenId &&
                                    r.bonusOwedWei &&
                                    wei(r.bonusOwedWei)! > 0n &&
                                    !r.bonusPaidOnChain && (
                                      <button
                                        type="button"
                                        className="primary"
                                        // payBonus is one-shot on-chain: paying
                                        // while lines are still open locks in an
                                        // undercount forever.
                                        disabled={
                                          writePending ||
                                          !isConnected ||
                                          !r.decided
                                        }
                                        title={
                                          r.decided
                                            ? undefined
                                            : 'Not all lines decided — amount can still grow'
                                        }
                                        onClick={() =>
                                          void payBonus(
                                            r.receiptTokenId!,
                                            r.wins ?? 0,
                                            r.bonusOwedWei!
                                          )
                                        }
                                      >
                                        Bonus
                                      </button>
                                    )}
                                  {r.receiptTokenId &&
                                    r.referralOwedWei &&
                                    wei(r.referralOwedWei)! > 0n &&
                                    !r.referralPaidOnChain && (
                                      <button
                                        type="button"
                                        className="ghost"
                                        disabled={writePending || !isConnected}
                                        onClick={() =>
                                          void payReferral(
                                            r.receiptTokenId!,
                                            r.referralOwedWei!
                                          )
                                        }
                                      >
                                        Referral
                                      </button>
                                    )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
          </>
        )}
      </section>
    </main>
  );
}
