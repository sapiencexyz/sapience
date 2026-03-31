import { useState, useCallback } from 'react';
import { useBalance, useSendTransaction } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { useSession } from '../lib/SessionContext';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  eoaAddress: Address;
  smartAccountAddress: Address;
  chainId: number;
}

type Direction = 'eoa-to-sa' | 'sa-to-eoa';
type TxStatus = 'idle' | 'pending' | 'success' | 'error';

export function TransferDialog({
  open,
  onClose,
  eoaAddress,
  smartAccountAddress,
  chainId,
}: TransferDialogProps) {
  const [direction, setDirection] = useState<Direction>('eoa-to-sa');
  const [amount, setAmount] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);

  const { etherealClient, isSessionActive } = useSession();
  const { sendTransactionAsync } = useSendTransaction();

  const sourceAddr = direction === 'eoa-to-sa' ? eoaAddress : smartAccountAddress;
  const { data: sourceBal } = useBalance({
    address: sourceAddr,
    chainId,
    query: { enabled: open },
  });
  const sourceBalance = sourceBal?.value ?? 0n;

  const handleTransfer = useCallback(async () => {
    const wei = parseEther(amount || '0');
    if (wei <= 0n) return;

    setTxStatus('pending');
    setTxError(null);

    try {
      if (direction === 'eoa-to-sa') {
        // EOA -> SA: standard tx (wallet popup)
        await sendTransactionAsync({
          to: smartAccountAddress,
          value: wei,
        });
      } else {
        // SA -> EOA: UserOp via session key (no popup, gasless)
        if (!isSessionActive || !etherealClient) {
          throw new Error('No active session — cannot send from smart account');
        }
        const account = etherealClient.account;
        if (!account || !('encodeCalls' in account)) {
          throw new Error('Smart account not available');
        }
        await etherealClient.sendUserOperation({
          callData: await (
            account as {
              encodeCalls: (
                calls: { to: Address; data: `0x${string}`; value: bigint }[],
              ) => Promise<`0x${string}`>;
            }
          ).encodeCalls([{ to: eoaAddress, data: '0x', value: wei }]),
        });
      }
      setTxStatus('success');
      setAmount('');
    } catch (err) {
      console.error('[transfer]', err);
      setTxError(err instanceof Error ? err.message : 'Transfer failed');
      setTxStatus('error');
    }
  }, [amount, direction, sendTransactionAsync, smartAccountAddress, eoaAddress, isSessionActive, etherealClient]);

  const handleClose = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
    setAmount('');
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="transfer-dialog" onClick={handleClose}>
      <div className="transfer-card" onClick={(e) => e.stopPropagation()}>
        <button className="transfer-close" onClick={handleClose}>x</button>
        <div className="transfer-title">Transfer USDe</div>

        <div className="transfer-direction">
          <button
            className={`transfer-direction-btn${direction === 'eoa-to-sa' ? ' transfer-direction-btn-active' : ''}`}
            onClick={() => setDirection('eoa-to-sa')}
          >
            EOA → SA
          </button>
          <button
            className={`transfer-direction-btn${direction === 'sa-to-eoa' ? ' transfer-direction-btn-active' : ''}`}
            onClick={() => setDirection('sa-to-eoa')}
            disabled={!isSessionActive}
          >
            SA → EOA
          </button>
        </div>

        <div className="transfer-balance">
          Balance: {Number(formatEther(sourceBalance)).toFixed(4)} USDe
        </div>

        <input
          className="transfer-input"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={txStatus === 'pending'}
        />

        <button
          className="transfer-submit-btn"
          onClick={handleTransfer}
          disabled={txStatus === 'pending' || !amount || parseFloat(amount) <= 0}
        >
          {txStatus === 'pending' ? 'Sending...' : 'Transfer'}
        </button>

        {txStatus === 'success' && (
          <div className="transfer-feedback transfer-success">Transfer sent</div>
        )}
        {txStatus === 'error' && txError && (
          <div className="transfer-feedback transfer-error">
            {txError.length > 80 ? txError.slice(0, 80) + '...' : txError}
          </div>
        )}
      </div>
    </div>
  );
}
