'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} className="p-2">
      <Sun className="dark:hidden h-5 w-5" />
      <Moon className="hidden dark:block h-5 w-5" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
