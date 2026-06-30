import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@sapience/ui/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import QuestionOrdering from '../../../components/admin/QuestionOrdering';

export const metadata: Metadata = {
  title: 'Question Ordering',
  description: 'Manually order the questions shown within a condition group',
  robots: { index: false },
};

const QuestionOrderingPage = () => {
  return (
    <div className="container pt-6 mx-auto px-6 pb-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Question Ordering</h1>
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Admin
          </Button>
        </Link>
      </header>
      <QuestionOrdering />
    </div>
  );
};

export default QuestionOrderingPage;
