import { redirect } from 'next/navigation';

// The markets list lives at the root now; keep the old path working.
export default function MarketsPage() {
  redirect('/');
}
