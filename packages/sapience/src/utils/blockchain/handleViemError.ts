import {
  EstimateGasExecutionError,
  UserRejectedRequestError,
  ChainDisconnectedError,
  HttpRequestError,
  InternalRpcError,
  InvalidInputRpcError,
  InvalidParamsRpcError,
  InvalidRequestRpcError,
  JsonRpcVersionUnsupportedError,
  MethodNotFoundRpcError,
  ParseRpcError,
  ProviderDisconnectedError,
  ResourceNotFoundRpcError,
  ResourceUnavailableRpcError,
  RpcError,
  TransactionRejectedRpcError,
} from 'viem';

const errorMappings = [
  {
    type: EstimateGasExecutionError,
    message: 'You have insufficient funds to cover gas for this transaction.',
  },
  { type: UserRejectedRequestError, message: 'User rejected the request.' },
  {
    type: ChainDisconnectedError,
    message: 'The blockchain network is disconnected.',
  },
  {
    type: HttpRequestError,
    message: 'Network request failed. Please check your internet connection.',
  },
  { type: InternalRpcError, message: 'Internal RPC error occurred.' },
  { type: InvalidInputRpcError, message: 'Invalid input provided.' },
  { type: InvalidParamsRpcError, message: 'Invalid parameters provided.' },
  { type: InvalidRequestRpcError, message: 'Invalid request.' },
  {
    type: JsonRpcVersionUnsupportedError,
    message: 'Unsupported JSON-RPC version.',
  },
  { type: MethodNotFoundRpcError, message: 'Requested method not found.' },
  { type: ParseRpcError, message: 'Error parsing response.' },
  { type: ProviderDisconnectedError, message: 'Provider disconnected.' },
  { type: ResourceNotFoundRpcError, message: 'Requested resource not found.' },
  {
    type: ResourceUnavailableRpcError,
    message: 'Requested resource is unavailable.',
  },
  { type: RpcError, message: 'RPC error occurred.' },
  { type: TransactionRejectedRpcError, message: 'Transaction was rejected.' },
];

export function handleViemError(
  error: Error,
  fallbackMessage = 'An unexpected error occurred.'
): string {
  // Check each error mapping using instanceof
  for (const mapping of errorMappings) {
    if (error instanceof mapping.type) {
      return mapping.message;
    }
  }

  // Fallback to error cause, message, or provided fallback
  return (error.cause as Error)?.message || error.message || fallbackMessage;
}
