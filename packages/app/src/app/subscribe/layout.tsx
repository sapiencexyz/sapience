import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gas and Blobspace Subscriptions',
};

export default function SubscribeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
