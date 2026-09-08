'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The markets list lives at the root now; keep the old path working.
 *
 * This must redirect on the client, not via `next/navigation`'s `redirect()`.
 * Under `output: 'export'` there is no server to issue a 307, so a server
 * redirect makes the prerender throw and Next writes an `__next_error__` shell
 * to `out/markets/index.html`. The build still succeeds, and because that file
 * exists the SPA `_redirects` fallback never fires — the route just serves a
 * blank error page.
 *
 * Reads `location` rather than `useSearchParams` so the page needs no Suspense
 * boundary, and forwards the query string: `?category=` is a real inbound link
 * shape (see `FocusAreaBadge`).
 */
export default function MarketsPage() {
  const router = useRouter();

  useEffect(() => {
    const { search, hash } = window.location;
    router.replace(`/${search}${hash}`);
  }, [router]);

  return null;
}
