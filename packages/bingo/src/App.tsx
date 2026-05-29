import { useEffect, useState } from 'react';
import AdminScreen from './screens/AdminScreen';
import MintScreen from './screens/MintScreen';
import CardDetailScreen from './screens/CardDetailScreen';
import ReferScreen from './screens/ReferScreen';

export default function App() {
  // Pathname-driven routing. MintScreen pushes /card/:id then dispatches a
  // popstate so we re-render. Pure router — every screen owns its own hooks.
  const [pathname, setPathname] = useState<string>(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  useEffect(() => {
    const onNav = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);

  if (pathname.startsWith('/admin')) return <AdminScreen />;
  const cardMatch = pathname.match(/^\/card\/(\d+)\/?$/);
  if (cardMatch) return <CardDetailScreen cardId={BigInt(cardMatch[1])} />;
  if (pathname.startsWith('/refer')) return <ReferScreen />;
  return <MintScreen />;
}
