import { useEffect, useMemo, useState } from 'react';
import {
  isAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  useAccount,
  useConnect,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  BINGO_CARD_ABI,
  CHAIN_ID,
  fmtUnits,
  loadContractAddress,
  saveContractAddress,
  shortAddress,
} from '../lib/bingoCard';
import { fetchConditionsByIds, type BingoConditionDetail } from '../api';
import Nav from '../components/Nav';

interface CardSnapshot {
  player: Address;
  refCode: Hex;
  poolVersion: number;
  mintedAt: bigint;
  expiresAt: bigint;
  sponsorBalance: bigint;
  cardPriceAtMint: bigint;
  referralBpsAtMint: number;
  revealed: boolean;
  referrerPaid: boolean;
  sidesDeclared: boolean;
  filledLineBitmap: number;
  cellSides: number;
  conditionIds: readonly Hex[];
  resolvers: readonly Address[];
}

interface BonusPreview {
  wins: number;
  payout: bigint;
}

interface Props {
  cardId: bigint;
}

export default function CardDetailScreen({ cardId }: Props) {
  const { address: eoa, isConnected } = useAccount();
  const { connectors, connect, isPending: connectPending } = useConnect();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

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

  const [card, setCard] = useState<CardSnapshot | null>(null);
  const [preview, setPreview] = useState<BonusPreview | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [conditionDetails, setConditionDetails] = useState<
    Map<string, BingoConditionDetail>
  >(new Map());

  const [pickedSides, setPickedSides] = useState(0);
  const [pickedMask, setPickedMask] = useState(0);
  const allCellsPicked = (pickedMask & 0xffff) === 0xffff;

  const {
    writeContract,
    isPending: writePending,
    error: writeError,
    data: lastTxHash,
  } = useWriteContract();
  const { isLoading: txLoading, data: txReceipt } =
    useWaitForTransactionReceipt({ hash: lastTxHash, chainId: CHAIN_ID });

  // Poll cardOf until revealed; after revealed, refresh on any tx receipt.
  useEffect(() => {
    if (!publicClient || !contractAddress) return;
    let stop = false;
    let interval: number | undefined;

    const tick = async () => {
      try {
        const c = (await publicClient.readContract({
          address: contractAddress,
          abi: BINGO_CARD_ABI,
          functionName: 'cardOf',
          args: [cardId],
        })) as CardSnapshot;
        if (stop) return;
        setCard(c);
        if (c.revealed && interval) {
          window.clearInterval(interval);
          interval = undefined;
          setStatusMsg(null);
        } else if (!c.revealed) {
          setStatusMsg('Waiting for Pyth Entropy reveal…');
        }
      } catch (err) {
        if (stop) return;
        setStatusMsg(err instanceof Error ? err.message : String(err));
      }
    };

    void tick();
    interval = window.setInterval(tick, 3_000);

    return () => {
      stop = true;
      if (interval) window.clearInterval(interval);
    };
  }, [publicClient, contractAddress, cardId, txReceipt]);

  // Bonus preview + claimed flag.
  useEffect(() => {
    if (!publicClient || !contractAddress || !card?.revealed) {
      setPreview(null);
      return;
    }
    let stop = false;
    void (async () => {
      try {
        const [previewRes, claimedRes] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: BINGO_CARD_ABI,
            functionName: 'previewBonus',
            args: [cardId],
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: BINGO_CARD_ABI,
            functionName: 'bonusClaimed',
            args: [cardId],
          }),
        ]);
        if (stop) return;
        const [wins, payout] = previewRes as [number, bigint];
        setPreview({ wins, payout });
        setClaimed(Boolean(claimedRes));
      } catch {
        setPreview(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [publicClient, contractAddress, card, cardId]);

  // Pull condition images + titles from sapience API.
  useEffect(() => {
    if (!card?.revealed) return;
    let stop = false;
    void (async () => {
      try {
        const map = await fetchConditionsByIds(Array.from(card.conditionIds));
        if (stop) return;
        setConditionDetails(map);
      } catch {
        // best-effort
      }
    })();
    return () => {
      stop = true;
    };
  }, [card]);

  const saveAddress = () => {
    if (!isAddress(addressInput)) return;
    saveContractAddress(addressInput);
  };

  const submitSetSides = () => {
    if (!baseContract) return;
    writeContract({
      ...baseContract,
      functionName: 'setCellSides',
      args: [cardId, pickedSides],
    });
  };

  const submitClaimBonus = () => {
    if (!baseContract) return;
    writeContract({
      ...baseContract,
      functionName: 'claimBonus',
      args: [cardId],
    });
  };

  const submitWithdrawUnused = () => {
    if (!baseContract) return;
    writeContract({
      ...baseContract,
      functionName: 'withdrawUnused',
      args: [cardId],
    });
  };

  const injected = connectors.find((c) => c.id === 'injected');
  const now = Math.floor(Date.now() / 1000);
  const isExpired = card != null && Number(card.expiresAt) < now;
  const lineCount = card
    ? Array.from({ length: 10 }).filter(
        (_, i) => (card.filledLineBitmap & (1 << i)) !== 0,
      ).length
    : 0;
  const cardComplete = lineCount === 10;
  const isPlayer =
    eoa && card && eoa.toLowerCase() === card.player.toLowerCase();

  return (
    <main>
      <Nav trailing={<>Card #{cardId.toString()}</>} />
      <header className="header">
        <div className="title-block">
          <h1>Card #{cardId.toString()}</h1>
        </div>
      </header>

      {!contractAddress && (
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
        </section>
      )}

      {contractAddress && !isConnected && injected && (
        <section className="screen admin-section">
          <button
            type="button"
            className="primary block"
            disabled={connectPending}
            onClick={() => connect({ connector: injected })}
          >
            {connectPending ? 'Opening wallet…' : 'Connect wallet'}
          </button>
        </section>
      )}

      {card && (
        <section className="screen admin-section">
          <div className="admin-kv">
            <div>Player</div>
            <div className="mono">{shortAddress(card.player)}</div>
            <div>Ref code</div>
            <div className="mono">{card.refCode}</div>
            <div>Sponsor balance</div>
            <div className="mono">{fmtUnits(card.sponsorBalance)}</div>
            <div>Revealed</div>
            <div className="mono">{card.revealed ? 'yes' : 'no'}</div>
            <div>Sides declared</div>
            <div className="mono">{card.sidesDeclared ? 'yes' : 'no'}</div>
            <div>Lines filled</div>
            <div className="mono">{lineCount} / 10</div>
            <div>Expires at</div>
            <div className="mono">
              {new Date(Number(card.expiresAt) * 1000).toLocaleString()}
            </div>
          </div>

          {card.revealed && !card.sidesDeclared && isPlayer && (
            <div className="admin-action">
              <div className="wizard-step-title">
                Pick YES or NO on each cell
              </div>
              <p className="muted small">
                One-shot. The 10 lines (4 rows, 4 cols, 2 diagonals) will be
                funded with these picks. A line wins iff every cell resolves
                in agreement with your side.
              </p>
              <div className="bingo-grid">
                {card.conditionIds.map((id, i) => {
                  const isPicked = (pickedMask & (1 << i)) !== 0;
                  const yes = isPicked && (pickedSides & (1 << i)) !== 0;
                  const no = isPicked && (pickedSides & (1 << i)) === 0;
                  const detail = conditionDetails.get(id.toLowerCase());
                  return (
                    <div
                      key={i}
                      className={`bingo-cell ${detail?.similarMarketImage ? 'cell-has-bg' : ''}`}
                      style={
                        detail?.similarMarketImage
                          ? {
                              backgroundImage: `linear-gradient(180deg, rgba(8,12,24,0.55) 0%, rgba(8,12,24,0.92) 100%), url(${detail.similarMarketImage})`,
                            }
                          : undefined
                      }
                    >
                      <div className="bingo-cell-title">
                        {detail?.shortName ?? detail?.question ?? id}
                      </div>
                      <div className="bingo-side-toggle">
                        <button
                          type="button"
                          className={yes ? 'primary' : 'ghost'}
                          onClick={() => {
                            setPickedSides((p) => p | (1 << i));
                            setPickedMask((m) => m | (1 << i));
                          }}
                        >
                          YES
                        </button>
                        <button
                          type="button"
                          className={no ? 'primary' : 'ghost'}
                          onClick={() => {
                            setPickedSides((p) => p & ~(1 << i));
                            setPickedMask((m) => m | (1 << i));
                          }}
                        >
                          NO
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="admin-row">
                <button
                  type="button"
                  className="primary"
                  disabled={writePending || !baseContract || !allCellsPicked}
                  onClick={submitSetSides}
                >
                  {allCellsPicked
                    ? 'Submit picks'
                    : `Pick all 16 cells (${
                        Array.from({ length: 16 }).filter(
                          (_, i) => (pickedMask & (1 << i)) !== 0,
                        ).length
                      }/16)`}
                </button>
              </div>
            </div>
          )}

          {card.revealed && card.sidesDeclared && (
            <div className="bingo-grid">
              {card.conditionIds.map((id, i) => {
                const yes = (card.cellSides & (1 << i)) !== 0;
                const detail = conditionDetails.get(id.toLowerCase());
                return (
                  <div
                    key={i}
                    className={`bingo-cell ${detail?.similarMarketImage ? 'cell-has-bg' : ''}`}
                    style={
                      detail?.similarMarketImage
                        ? {
                            backgroundImage: `linear-gradient(180deg, rgba(8,12,24,0.55) 0%, rgba(8,12,24,0.92) 100%), url(${detail.similarMarketImage})`,
                          }
                        : undefined
                    }
                  >
                    <div className="bingo-cell-title">
                      {detail?.shortName ?? detail?.question ?? id}
                    </div>
                    <div className={`bingo-side ${yes ? 'yes' : 'no'}`}>
                      {yes ? 'YES' : 'NO'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {cardComplete && preview && (
            <div className="admin-kv">
              <div>Winning lines now</div>
              <div className="mono">{preview.wins} / 10</div>
              <div>Bonus payout (live)</div>
              <div className="mono">{fmtUnits(preview.payout)}</div>
              <div>Bonus claimed</div>
              <div className="mono">{claimed ? 'yes' : 'no'}</div>
            </div>
          )}

          {card.sidesDeclared && !claimed && isPlayer && (
            <div className="admin-row">
              <button
                type="button"
                className="primary"
                disabled={writePending || txLoading || !cardComplete}
                onClick={() => {
                  if (
                    preview &&
                    preview.wins < 10 &&
                    !window.confirm(
                      `Claim is one-shot. You currently have ${preview.wins} winning lines. More may resolve later. Claim now?`,
                    )
                  ) {
                    return;
                  }
                  submitClaimBonus();
                }}
              >
                {cardComplete
                  ? 'Claim bonus'
                  : `Claim bonus (${lineCount}/10 lines funded)`}
              </button>
            </div>
          )}

          {isExpired && card.sponsorBalance > 0n && isPlayer && (
            <div className="admin-row">
              <button
                type="button"
                className="primary"
                disabled={writePending}
                onClick={submitWithdrawUnused}
              >
                Withdraw unused ({fmtUnits(card.sponsorBalance)})
              </button>
            </div>
          )}

          {writeError && <p className="error">{writeError.message}</p>}
          {statusMsg && <p className="muted small">{statusMsg}</p>}
        </section>
      )}
    </main>
  );
}
