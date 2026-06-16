import { useState } from 'react';
import SettingsDialog from './SettingsDialog';
import logoUrl from '../assets/combo-bingo-logo.png';

interface NavLink {
  href: string;
  label: string;
  /** Mark active when window.location.pathname startsWith one of these. */
  match: string[];
  /** When true, only mark active if pathname matches exactly. */
  exact?: boolean;
}

const LINKS: NavLink[] = [
  { href: '/', label: 'Draw', match: ['/'], exact: true },
  { href: '/card', label: 'Cards', match: ['/card'] },
  { href: '/refer', label: 'Refer', match: ['/refer'] },
];

interface Props {
  /** Optional extra context shown to the right of the nav (e.g. a card id). */
  trailing?: React.ReactNode;
}

export default function Nav({ trailing }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const path =
    typeof window === 'undefined' ? '/' : window.location.pathname;
  return (
    <>
      <nav className="brand-bar">
        <a href="/" className="brand" aria-label="combo.bingo home">
          <img className="brand-logo" src={logoUrl} alt="COMBO.BINGO" />
        </a>
        <div className="bingo-nav-trailing">
          {trailing}
          <div className="bingo-nav-links">
            {LINKS.map((l) => {
              const active = l.exact
                ? path === l.href
                : l.match.some((p) => path.startsWith(p));
              return (
                <a
                  key={l.href}
                  href={l.href}
                  className={`bingo-nav-link ${active ? 'active' : ''}`}
                >
                  {l.label}
                </a>
              );
            })}
          </div>
          <button
            type="button"
            className="bingo-nav-gear"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </nav>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
