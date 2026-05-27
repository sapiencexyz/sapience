interface NavLink {
  href: string;
  label: string;
  /** Mark active when window.location.pathname startsWith one of these. */
  match: string[];
}

const LINKS: NavLink[] = [
  { href: '/play', label: 'Mint', match: ['/play'] },
  { href: '/refer', label: 'Refer', match: ['/refer'] },
  { href: '/admin', label: 'Admin', match: ['/admin'] },
];

interface Props {
  /** Optional extra context shown to the right of the nav (e.g. a card id). */
  trailing?: React.ReactNode;
}

export default function Nav({ trailing }: Props) {
  const path =
    typeof window === 'undefined' ? '/' : window.location.pathname;
  return (
    <nav className="bingo-nav">
      <div className="bingo-nav-links">
        {LINKS.map((l) => {
          const active = l.match.some((p) => path.startsWith(p));
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
      {trailing && <div className="bingo-nav-trailing">{trailing}</div>}
    </nav>
  );
}
