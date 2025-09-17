'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { SearchIcon, X } from 'lucide-react';
import { Input } from '@sapience/ui/components/ui/input';

interface SearchBarProps {
  isMobile: boolean;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ isMobile, value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState<boolean>(!!value);

  useEffect(() => {
    setHasText(!!value);
  }, [value]);

  const handleClear = () => {
    setHasText(false);
    const input = inputRef.current;
    if (input) {
      input.value = '';
      onChange({
        target: input,
        currentTarget: input,
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      input.focus();
    } else {
      onChange({
        target: { value: '' } as unknown as HTMLInputElement,
        currentTarget: { value: '' } as unknown as HTMLInputElement,
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <div className="relative flex items-center">
      <SearchIcon
        className="absolute left-1 md:left-0 top-1/2 md:top-0 md:bottom-0 -translate-y-1/2 md:translate-y-0 h-5 w-5 md:h-full md:w-auto md:p-3 text-muted-foreground opacity-40 z-10 pointer-events-none"
        strokeWidth={1}
      />
      <div className="flex-1 relative border-b border-border/80">
        <Input
          ref={inputRef}
          type="text"
          placeholder={isMobile ? 'Search' : 'Search questions...'}
          value={value}
          onChange={onChange}
          className="w-full text-lg md:text-3xl font-heading font-normal bg-transparent rounded-none border-0 placeholder:text-foreground placeholder:opacity-20 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto py-1.5 md:py-3 pl-8 md:pl-16 pr-8 md:pr-14"
        />
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className={`absolute right-1 md:right-0 top-[60%] -translate-y-1/2 p-2 text-muted-foreground/60 hover:text-muted-foreground/80 z-10 transition-opacity duration-200 ease-out ${hasText ? 'opacity-60 hover:opacity-80 focus:opacity-80' : 'opacity-0 pointer-events-none'}`}
        >
          <X className="h-4 w-4 md:h-5 md:w-5" strokeWidth={1} />
        </button>
      </div>
    </div>
  );
};

export default SearchBar;
