'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

const LOGGED_OUT_KEY = 'sapience:loggedOut';

interface AuthContextValue {
  /** Whether user has explicitly logged out (even if wallet is still connected) */
  isLoggedOut: boolean;
  /** Mark user as logged out */
  setLoggedOut: () => void;
  /** Clear logged out state (on login) */
  clearLoggedOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOGGED_OUT_KEY);
      if (stored === 'true') {
        setIsLoggedOut(true);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const setLoggedOut = useCallback(() => {
    setIsLoggedOut(true);
    try {
      window.localStorage.setItem(LOGGED_OUT_KEY, 'true');
    } catch {
      // localStorage not available
    }
  }, []);

  const clearLoggedOut = useCallback(() => {
    setIsLoggedOut(false);
    try {
      window.localStorage.removeItem(LOGGED_OUT_KEY);
    } catch {
      // localStorage not available
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedOut, setLoggedOut, clearLoggedOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  // Return safe defaults if context is not available
  // This can happen during SSR or if a component is rendered outside the provider
  if (!context) {
    return {
      isLoggedOut: false,
      setLoggedOut: () => {},
      clearLoggedOut: () => {},
    };
  }
  return context;
}
