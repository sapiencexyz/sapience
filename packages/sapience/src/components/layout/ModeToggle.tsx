'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full md:h-9 md:w-9"
    >
      {mounted && (
        <>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </>
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
