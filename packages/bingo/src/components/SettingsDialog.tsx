import { useState } from 'react';
import { isAddress } from 'viem';
import {
  loadContractAddress,
  saveContractAddress,
} from '../lib/bingoCard';

interface Props {
  onClose: () => void;
}

/**
 * Modal triggered by the Nav settings gear. Owns the contract-address input
 * that used to live inline in every screen. Persists to localStorage; the
 * caller reloads so screens re-read it.
 */
export default function SettingsDialog({ onClose }: Props) {
  const [addressInput, setAddressInput] = useState<string>(
    loadContractAddress() ?? '',
  );
  const canSave = isAddress(addressInput);

  const save = () => {
    if (!canSave) return;
    saveContractAddress(addressInput);
    onClose();
    // Force every screen to re-read the stored address.
    window.location.reload();
  };

  return (
    <div
      className="bingo-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bingo-modal" role="dialog" aria-modal="true">
        <h2>Settings</h2>
        <div className="admin-action">
          <div className="wizard-step-title">BingoCard contract address</div>
          <p className="muted small">
            Persists in localStorage. Used by every screen in this app.
          </p>
          <div className="admin-row">
            <input
              className="admin-input"
              placeholder="0x…"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value.trim())}
            />
          </div>
        </div>
        <div className="admin-row">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canSave}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
