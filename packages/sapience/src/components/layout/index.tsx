'use client';

import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@foil/ui/components/ui/sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';
import { useState } from 'react';

import Header from './Header';

const ContentArea = ({ children }: { children: ReactNode }) => {
  const { state } = useSidebar();

  return (
    <SidebarInset
      className={`
        p-0 m-0 w-full max-w-none transition-all duration-300 ease-in-out
        ${state === 'expanded' ? 'md:ml-[var(--sidebar-width)] md:w-[calc(100%-var(--sidebar-width))]' : 'ml-0 w-full'}
      `}
    >
      {children}
    </SidebarInset>
  );
};

const Layout = ({ children }: { children: ReactNode }) => {
  const [showNotification, setShowNotification] = useState(true);

  return (
    <SidebarProvider
      defaultOpen
      style={{ '--sidebar-width': '12rem' } as React.CSSProperties}
    >
      <div className="min-h-screen flex flex-col overflow-hidden w-full">
        <Header />
        <div className="flex-1 flex w-full">
          <ContentArea>{children}</ContentArea>
        </div>

        <AnimatePresence>
          {showNotification && (
            <motion.div
              className="fixed bottom-4 right-4 bg-white dark:bg-zinc-900 shadow-lg rounded-md p-4 z-50 flex items-center gap-3 border border-gray-200 dark:border-zinc-800 max-w-[340px] text-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20, transition: { duration: 0.1 } }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <img
                src="/bob.gif"
                alt="Under Construction"
                className="h-[52px] w-auto object-contain px-1"
              />
              <span>
                We&apos;re{' '}
                <a
                  href="https://github.com/foilxyz/foil/tree/main/packages/sapience"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  building in public
                </a>{' '}
                and want your feedback.{' '}
                <a
                  href="https://discord.gg/Hn2vzMDCSs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Join us
                </a>
                .
              </span>
              <button
                type="button"
                onClick={() => setShowNotification(false)}
                className="ml-1 p-3 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Close notification"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
