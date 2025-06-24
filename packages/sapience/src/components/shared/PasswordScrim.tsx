'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type React from 'react';

// Create a motion-compatible version of the shadcn Button
const MotionButton = motion(Button);

// This password scrim is intended to be a UX feature and not a security feature.
// Please do not submit vulnerability reports for this.
const PasswordScrim = () => {
  const [isLoadingAuthStatus, setIsLoadingAuthStatus] = useState(true);
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showError, setShowError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoadingAuthStatus(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryPassword = params.get('password');
    if (queryPassword?.toLowerCase() === 'nostradamus') {
      localStorage.setItem('isAuthenticated', 'true');
      setIsAuthenticated(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const OVERFLOW_HIDDEN_CLASS = 'overflow-hidden';
    if (!isAuthenticated) {
      document.body.classList.add(OVERFLOW_HIDDEN_CLASS);
    } else {
      document.body.classList.remove(OVERFLOW_HIDDEN_CLASS);
    }
    // Cleanup function to remove the class when the component unmounts
    // or when isAuthenticated changes leading to the component returning null.
    return () => {
      document.body.classList.remove(OVERFLOW_HIDDEN_CLASS);
    };
  }, [isAuthenticated]);

  // Effect to automatically hide the error message
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (showError) {
      timer = setTimeout(() => {
        setShowError(false);
      }, 300); // Changed from 2500ms to 300ms to exit after entry animation
    }
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showError]);

  // Force light mode rendering for the iframe
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch (e) {
          console.error('Could not inject styles into iframe:', e);
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.toLowerCase() === 'nostradamus') {
      // Case-insensitive check
      localStorage.setItem('isAuthenticated', 'true');
      setIsAuthenticated(true);
      setShowError(false);
    } else {
      setShowError(true);
    }
    setPassword(''); // Clear password field
  };

  return (
    <AnimatePresence>
      {!isLoadingAuthStatus && !isAuthenticated && (
        <motion.div
          key="password-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { ease: 'easeInOut' } }}
          exit={{
            opacity: 0,
            transition: { duration: 1.33, ease: 'easeInOut' },
          }}
          transition={{
            duration: 0.33, // Fast fade in
          }}
          className="fixed inset-0 z-[9999] flex flex-col bg-background h-screen"
        >
          {/* Error Message moved here for fixed, centered positioning */}
          <AnimatePresence>
            {showError && (
              <motion.p
                key="error-message"
                initial={{ opacity: 0, scale: 0.9, y: -16 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { duration: 0.1, ease: 'easeOut' },
                }}
                exit={{
                  opacity: 0,
                  y: -36,
                  transition: { duration: 0.5, ease: 'easeIn' },
                }}
                className="fixed inset-0 flex items-center justify-center z-20 text-xs text-red-500 pointer-events-none"
              >
                Invalid Password
              </motion.p>
            )}
          </AnimatePresence>

          {/* Main content area - full height, centers form, explicit z-index */}
          <div className="relative flex flex-col items-center justify-center h-full w-full z-10">
            <div className="w-full max-w-xl p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative flex items-center">
                  <Label htmlFor="password" className="sr-only">
                    Password
                  </Label>
                  <Input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="bg-background h-12 text-lg flex-grow pr-16 sm:pr-20"
                    autoFocus
                    data-1p-ignore
                  />
                  <AnimatePresence>
                    {password.length > 0 && (
                      <MotionButton
                        type="submit"
                        className="absolute right-2 top-1/2 h-8 px-3 text-xs"
                        style={{ y: '-50%' }}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        Submit
                      </MotionButton>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex items-center gap-3 text-sm flex-row justify-between">
                  <Link
                    href="https://docs.sapience.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-0.5 text-xs tracking-widest transition-all duration-300 font-semibold uppercase"
                  >
                    Read the docs
                  </Link>
                  <Link
                    href="https://discord.gg/HRWFwXHM7x"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-0.5 text-xs tracking-widest transition-all duration-300 font-semibold uppercase"
                  >
                    Request early access
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </form>
            </div>
          </div>

          {/* Fuzz iframe container - positioned behind content, full screen, explicit z-index */}
          <motion.div
            key="fuzz-iframe"
            initial={{ scale: 1, opacity: 0.5 }}
            exit={{ scale: 1.5, opacity: 0.5 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 w-full h-full pointer-events-none z-1"
          >
            {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
            <iframe
              ref={iframeRef}
              src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
              className="absolute inset-0 w-full h-full"
              style={{
                border: 'none',
                colorScheme: 'light',
                filter: 'none',
              }}
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PasswordScrim;
