import { useCallback, useReducer } from 'react';
import type { Address } from 'viem';

export interface TransactionState {
  isLoading: boolean;
  error: string | null;
  success: boolean | null;
  txHash: Address | undefined;
}

export type TransactionAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_SUCCESS' }
  | { type: 'SET_TX_HASH'; payload: Address }
  | { type: 'RESET' };

const initialState: TransactionState = {
  isLoading: false,
  error: null,
  success: null,
  txHash: undefined,
};

function transactionReducer(
  state: TransactionState,
  action: TransactionAction
): TransactionState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        success: null,
        isLoading: false,
      };
    case 'SET_SUCCESS':
      return {
        ...state,
        success: true,
        error: null,
        isLoading: false,
      };
    case 'SET_TX_HASH':
      return { ...state, txHash: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export interface UseTransactionStateResult {
  state: TransactionState;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string) => void;
  setSuccess: () => void;
  setTxHash: (hash: Address) => void;
  reset: () => void;
}

/**
 * Generic hook for managing transaction state
 * Provides a reducer-based state management for blockchain transactions
 */
export function useTransactionState(): UseTransactionStateResult {
  const [state, dispatch] = useReducer(transactionReducer, initialState);

  const setLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: isLoading });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const setSuccess = useCallback(() => {
    dispatch({ type: 'SET_SUCCESS' });
  }, []);

  const setTxHash = useCallback((hash: Address) => {
    dispatch({ type: 'SET_TX_HASH', payload: hash });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    setLoading,
    setError,
    setSuccess,
    setTxHash,
    reset,
  };
}
