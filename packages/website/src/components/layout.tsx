import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/theme-provider';

import { Footer } from './footer';
import { Header } from './header';

type LayoutProps = {
  children: ReactNode;
};

const Layout = ({ children }: LayoutProps) => {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main>{children}</main>
        <Footer />
      </div>
    </ThemeProvider>
  );
};

export default Layout;
