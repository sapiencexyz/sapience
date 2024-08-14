import { ToastId, UseToastOptions } from '@chakra-ui/react';
import { ReadContractErrorType, WriteContractErrorType } from 'viem';

export const renderContractErrorToast = (
  error: ReadContractErrorType | WriteContractErrorType | null,
  toast: (options?: UseToastOptions) => ToastId,
  desc: string
) => {
  if (error) {
    console.error(desc, error.message);
    toast({
      title: desc,
      description: error.message,
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  }
};

export const renderToastSuccess = (
  toast: (options?: UseToastOptions) => ToastId,
  desc: string
) => {
  toast({
    title: desc,
    status: 'success',
    duration: 5000,
    isClosable: true,
  });
};
