'use client';

import { Button } from '@foil/ui/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function FutarchySection() {
  return (
    <section className="pt-48 pb-96 px-8">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row-reverse items-center gap-12">
          {/* Text content */}
          <div className="flex-1">
            <h2 className="text-3xl font-heading font-normal mb-6">
              Futarchy: Markets for Better Decisions
            </h2>
            <p className="text-lg mb-6">
              Inspired by futarchy, we’re building prediction markets that help
              inform better policy decisions.
            </p>
            <p className="text-muted-foreground mb-8">
              Our infrastructure lets organizations harness collective
              intelligence through markets without changing governance
              structures.
            </p>

            <Button asChild size="lg" variant="outline">
              <Link href="/futarchy">
                Learn More <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Visual content - Replaced with Image */}
          <div className="flex-1 relative aspect-video">
            <Image
              src="/futarchy.png"
              alt="Futarchy prediction market concept"
              fill
              className="rounded-lg object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
