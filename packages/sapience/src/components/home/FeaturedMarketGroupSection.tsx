'use client';

import { Button } from '@sapience/ui/components/ui/button';
import Link from 'next/link';
import FeaturedMarketGroup from './FeaturedMarketGroup';

export default function FeaturedMarketGroupSection() {
  return (
    <section className="py-12">
      <FeaturedMarketGroup />
      <div className="flex justify-center mt-8">
        <Link href="/markets">
          <Button>Explore Prediction Markets</Button>
        </Link>
      </div>
    </section>
  );
}
