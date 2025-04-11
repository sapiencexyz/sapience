'use client';

import { Button } from '@foil/ui/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';

export default function FutarchySection() {
  return (
    <section className="pt-48 pb-64 px-8">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row items-center gap-12">
          {/* Visual content - Image */}
          <div className="flex-1 relative aspect-video min-h-[250px]">
            <Image
              src="/futarchy.png"
              alt="Futarchy prediction market concept"
              fill
              className="rounded-lg object-cover"
            />
          </div>

          {/* Text content */}
          <div className="flex-1">
            <h2 className="text-3xl font-heading font-normal mb-6">
              Exploring Futarchy
            </h2>
            <p className="text-lg mb-6">
              Futarchy leverages prediction markets to determine which policies
              will best achieve established goals, combining collective
              intelligence with data-driven governance.
            </p>
            <p className="text-muted-foreground mb-8">
              Sapience forecasters can help guide policy decisions by providing
              predictions about which strategies could most effectively achieve
              measurable outcomes.
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
