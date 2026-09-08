import type { Metadata } from 'next';
import SpaFallbackRouter from '~/components/static/SpaFallbackRouter';

export const metadata: Metadata = {
  title: '404 Not Found',
};

export default function NotFound() {
  return <SpaFallbackRouter />;
}
