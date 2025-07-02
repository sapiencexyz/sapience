'use client';

import { Input } from '@sapience/ui/components/ui/input';
import { Search } from 'lucide-react';

interface QuestionSelectProps {
  className?: string;
  selectedQuestion?: string;
}

const QuestionSelect = ({ className, selectedQuestion }: QuestionSelectProps) => {
  return (
    <div className={`${className || ''}`}>
      {/* Search input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
          <Search className="h-5 w-5 text-muted-foreground" />
        </div>
        <Input
          value={selectedQuestion || ""}
          placeholder="Search questions..."
          className="pl-10 h-12 text-base"
          readOnly={!!selectedQuestion}
        />
      </div>
    </div>
  );
};

export default QuestionSelect; 