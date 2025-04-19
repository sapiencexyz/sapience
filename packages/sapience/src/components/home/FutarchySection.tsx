'use client';

import { Button } from '@foil/ui/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';

export default function FutarchySection() {
  return (
    <section className="pt-48 pb-64 px-8">
      <div className="container mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <div className="w-full lg:w-1/2 relative aspect-video min-h-[250px]">
            <Image
              src="/futarchy.png"
              alt="Futarchy prediction market concept"
              fill
              className="rounded-lg object-cover"
            />
          </div>

          <div className="w-full lg:w-1/2 lg:max-w-sm lg:ml-8">
            <h2 className="text-3xl font-heading font-normal mb-6">
              Exploring Futarchy
            </h2>
            <p className="text-lg mb-6">
              Futarchy leverages prediction markets to determine which policies
              could best achieve pre-established goals.
            </p>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full"
            >
              <Link href="/futarchy">Learn more</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
