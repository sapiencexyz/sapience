'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import { AlertTriangle, SquareStack } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHead,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import { AddressDisplay } from '~/components/shared/AddressDisplay';

const ParlaysPage = () => {
  const placeholderOrders = [
    { id: '1001', maker: '0xA0Cf6F0C1FfEee1bB0D3F1e5bE3C2A1b2C3D4E5F' },
    { id: '1002', maker: '0x5B3eC8A7d9F2a1B3c4D5e6F7a8B9c0D1E2F3A4B5' },
    { id: '1003', maker: '0x9C8F7E6D5C4B3A2F1E0d9c8b7a6F5e4d3C2B1A0F' },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4">
      <div className="pt-12 md:pt-16">
        <h1 className="text-2xl md:text-3xl font-heading mb-2 flex items-center gap-2">
          <SquareStack className="w-6 h-6 text-muted-foreground" />
          Parlays
        </h1>
        <div className="mt-4 mb-6">
          <Badge
            variant="outline"
            className="px-1.5 py-0.5 text-xs font-medium border-yellow-500/40 bg-yellow-500/10 text-yellow-600 inline-flex items-center gap-1"
          >
            <AlertTriangle className="w-3 h-3" />
            Experimental Feature
          </Badge>
        </div>
        <h2 className="text-lg font-medium mb-3">Open Orders</h2>
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Maker</TableHead>
                <TableHead>Positions</TableHead>
                <TableHead>Fill Amount</TableHead>
                <TableHead>Total Payout</TableHead>
                <TableHead>Settles</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placeholderOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono align-middle">
                    {order.id}
                  </TableCell>
                  <TableCell className="align-middle">
                    <AddressDisplay address={order.maker} />
                  </TableCell>
                  <TableCell className="text-muted-foreground align-middle">
                    Coming Soon
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className="text-muted-foreground">20 sUSDe</span>
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className="text-muted-foreground">22 sUSDe</span>
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className="text-muted-foreground">in 4 days</span>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <Button size="sm">Fill</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-medium mb-2">Your Parlays</h2>
          <p className="text-sm text-muted-foreground">Coming soon</p>
        </div>
      </div>
    </div>
  );
};

export default ParlaysPage;
