import { useState } from 'react';
import { loadServerUrl, saveServerUrl } from '../lib/backendApi';

interface Props {
  onClose: () => void;
}

/**
 * Modal triggered by the Nav settings gear. Owns the backend URL input.
 * Persists to localStorage; the caller reloads so screens re-read it.
 */
export default function SettingsDialog({ onClose }: Props) {
  const [urlInput, setUrlInput] = useState<string>(loadServerUrl());
  const canSave = (() => {
    const v = urlInput.trim();
    if (!v) return true; // empty clears the override
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  })();

  const save = () => {
    if (!canSave) return;
    saveServerUrl(urlInput);
    onClose();
    // Force every screen to re-read the stored URL.
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
          <div className="wizard-step-title">Backend URL</div>
          <p className="muted small">
            COMBO.BINGO backend service. Persists in localStorage; leave blank
            to use the default.
          </p>
          <div className="admin-row">
            <input
              className="admin-input"
              placeholder="http://localhost:3200"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value.trim())}
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
