'use client';

import dynamic from 'next/dynamic';

const CreateMarketGroupForm = dynamic(
  () => import('~/components/admin/CreateMarketGroupForm'),
  { ssr: false }
);

export default function CreateMarketGroupPage() {
  return (
    <div className="container pt-24 mx-auto px-6 pb-6 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl">Create New Market Group</h1>
      </header>
      <CreateMarketGroupForm />
    </div>
  );
}
