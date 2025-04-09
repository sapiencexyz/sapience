import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

const FutarchyPage = () => {
  return (
    <div className="container max-w-[740px] mx-auto p-4 md:p-8 lg:p-20 flex flex-col justify-center min-h-[100vh]">
      <h1 className="text-3xl md:text-4xl font-heading font-normal mb-6 md:mb-8">
        Vote on values, but bet on beliefs
      </h1>
      <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
        Economist Robin Hanson developed the concept of{' '}
        <strong className="font-semibold">futarchy</strong>, where goals are
        democratically defined and prediction markets determine which policies
        could best achieve them.
      </p>
      <p className="text-muted-foreground text-lg mb-4 leading-relaxed">
        Help lay the groundwork for futarchy by building and participating in
        the most liquid prediction markets for future forecasting on the planet.
      </p>
      <Link
        href="/predictions"
        className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1.5 text-xs tracking-widest transition-all duration-300 font-semibold mt-4 self-start"
      >
        EXPLORE PREDICTIONS
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

export default FutarchyPage;
