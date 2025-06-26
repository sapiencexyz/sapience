'use client';

import CombinedMarketDialog from '~/components/admin/CombinedMarketDialog';

export default function CreateMarketGroupPage() {
  return (
    <div className="container pt-24 mx-auto px-6 pb-6">
      <header className="mb-8">
        <h1 className="text-3xl mb-2">Create New Market Group</h1>
        <p className="text-muted-foreground">
          Launch a new market group with multiple markets
        </p>
      </header>

      <div className="max-w-4xl">
        <CombinedMarketDialog />
      </div>
    </div>
  );
}
