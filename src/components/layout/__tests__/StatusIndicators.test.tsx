import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';

import { StatusIndicators } from '../StatusIndicators';

vi.mock('~/hooks/blockchain/useRpcPing', () => ({
  useRpcPing: () => 42,
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: React.ComponentProps<'img'>) => <img {...props} />,
}));

vi.mock('~/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

describe('StatusIndicators', () => {
  test('shows the RPC ping', () => {
    render(<StatusIndicators />);
    expect(screen.getByText(/42ms/)).toBeInTheDocument();
  });

  test('shows the Robinhood logomark', () => {
    render(<StatusIndicators />);
    expect(screen.getByAltText('Robinhood')).toBeInTheDocument();
    expect(screen.queryByAltText('Ethereal')).toBeNull();
  });
});
