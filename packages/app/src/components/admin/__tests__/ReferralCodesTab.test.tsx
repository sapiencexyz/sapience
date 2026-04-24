import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toastSpy = vi.fn();
const analyticsHookCalls: Array<number | undefined> = [];

const sampleCode = {
  id: 1,
  codeHash: '0xabc123deadbeef',
  maxClaims: 5,
  isActive: true,
  expiresAt: null,
  createdBy: '0x1234',
  creatorType: 'admin' as const,
  createdAt: '2026-04-20T00:00:00.000Z',
  claimCount: 0,
};

const mockCodesQuery = {
  data: [sampleCode],
  isLoading: false,
  error: null as Error | null,
};

const mockCreateMutation = { mutateAsync: vi.fn() };
const mockUpdateMutation = { mutateAsync: vi.fn() };
const mockDeleteMutation = { mutateAsync: vi.fn() };

vi.mock('@sapience/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1234' }),
}));

vi.mock('@sapience/ui/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@sapience/ui/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@sapience/ui/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) => (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}));

vi.mock('@sapience/ui/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span>Select</span>,
}));

vi.mock('@sapience/ui/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@sapience/ui/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@sapience/ui/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('../data-table', () => ({
  __esModule: true,
  default: ({
    columns,
    data,
  }: {
    columns: Array<{
      id?: string;
      header?: string;
      cell?: (args: { row: { original: (typeof sampleCode) & { category?: { slug?: string } } } }) => React.ReactNode;
    }>;
    data: Array<(typeof sampleCode) & { category?: { slug?: string } }>;
  }) => {
    const actionColumn = columns.find((column) => column.id === 'actions');
    return (
      <div>
        {data.map((row) => (
          <div key={row.id}>{actionColumn?.cell?.({ row: { original: row } })}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('~/hooks/referrals/useAdminReferralCodes', () => ({
  useAdminReferralCodes: () => mockCodesQuery,
  useAdminReferralCodeAnalytics: (id: number | undefined) => {
    analyticsHookCalls.push(id);
    return {
      data: null,
      isLoading: false,
      error: id === 1 ? new Error('analytics blew up') : null,
    };
  },
  useCreateAdminReferralCode: () => mockCreateMutation,
  useUpdateAdminReferralCode: () => mockUpdateMutation,
  useDeleteAdminReferralCode: () => mockDeleteMutation,
}));

import ReferralCodesTab from '../ReferralCodesTab';

describe('ReferralCodesTab', () => {
  beforeEach(() => {
    toastSpy.mockClear();
    analyticsHookCalls.length = 0;
    mockCodesQuery.error = null;
    mockCreateMutation.mutateAsync.mockReset();
    mockUpdateMutation.mutateAsync.mockReset();
    mockDeleteMutation.mutateAsync.mockReset();
  });

  it('clears the analytics query id after an error so retrying the same code refetches', async () => {
    render(<ReferralCodesTab createOpen={false} setCreateOpen={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'View analytics' }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: 'Error',
          description: 'analytics blew up',
        })
      );
      expect(analyticsHookCalls.at(-1)).toBeUndefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'View analytics' }));

    await waitFor(() => {
      expect(analyticsHookCalls.filter((id) => id === 1)).toHaveLength(2);
    });
  });

  it('toasts when the initial codes fetch fails', async () => {
    mockCodesQuery.error = new Error('codes blew up');

    render(<ReferralCodesTab createOpen={false} setCreateOpen={vi.fn()} />);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: 'Error',
          description: 'codes blew up',
        })
      );
    });
  });
});
