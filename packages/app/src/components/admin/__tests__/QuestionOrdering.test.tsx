import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type {
  AdminConditionGroup,
  AdminConditionGroupCondition,
} from '~/hooks/admin/useAdminConditionGroups';

const toastSpy = vi.fn();
const reorderMutate = vi.fn();
let groupsData: AdminConditionGroup[] = [];
let hydratedByGlobalId = new Map<string, AdminConditionGroupCondition[]>();
let conditionsLoading = false;

vi.mock('@sapience/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: true }),
}));

vi.mock('lucide-react', () => ({
  GripVertical: () => <span aria-hidden="true">grip</span>,
  ArrowUp: () => <span aria-hidden="true">up</span>,
  ArrowDown: () => <span aria-hidden="true">down</span>,
  Check: () => <span aria-hidden="true">check</span>,
}));

vi.mock('@sapience/ui/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@sapience/ui/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@dnd-kit/core', () => ({
  closestCenter: vi.fn(),
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: {
      active: { id: string };
      over: { id: string } | null;
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onDragEnd?.({
            active: { id: 'condition-a' },
            over: { id: 'condition-b' },
          })
        }
      >
        Move A after B
      </button>
      {children}
    </div>
  ),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock('~/hooks/admin/useAdminConditionGroups', async () => {
  const actual = await vi.importActual<
    typeof import('~/hooks/admin/useAdminConditionGroups')
  >('~/hooks/admin/useAdminConditionGroups');
  return {
    ...actual,
    useAdminConditionGroups: () => ({
      data: groupsData,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useAdminGroupConditions: (
      globalId: string | null | undefined,
      enabled: boolean
    ) => {
      const fallback = groupsData.find(
        (g) => g.globalId === globalId
      )?.condition;
      const data =
        enabled && globalId
          ? (hydratedByGlobalId.get(globalId) ?? fallback)
          : undefined;
      return {
        data,
        isLoading: conditionsLoading,
        isFetching: conditionsLoading,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    },
    useReorderConditionGroup: () => ({
      mutate: reorderMutate,
      isPending: false,
    }),
  };
});

import QuestionOrdering from '../QuestionOrdering';

function makeGroup(
  overrides: Partial<AdminConditionGroup> = {}
): AdminConditionGroup {
  return {
    id: 42,
    globalId: 'gid-42',
    name: 'Test group',
    negRisk: false,
    hasMoreConditions: false,
    condition: [
      {
        id: 'condition-a',
        question: 'Question A',
        shortName: null,
        optionName: null,
        similarMarketVolume: 100,
        displayOrder: 0,
      },
      {
        id: 'condition-b',
        question: 'Question B',
        shortName: null,
        optionName: null,
        similarMarketVolume: 200,
        displayOrder: 1,
      },
    ],
    ...overrides,
  };
}

describe('QuestionOrdering', () => {
  beforeEach(() => {
    groupsData = [makeGroup()];
    hydratedByGlobalId = new Map();
    conditionsLoading = false;
    reorderMutate.mockReset();
    toastSpy.mockReset();
  });

  it('preserves a dirty draft when the selected group refetches', async () => {
    const { rerender } = render(<QuestionOrdering />);

    fireEvent.click(screen.getByRole('button', { name: /Test group/ }));
    await screen.findByText('Question A');

    fireEvent.click(screen.getByRole('button', { name: 'Move A after B' }));

    groupsData = [makeGroup()];
    rerender(<QuestionOrdering />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save order' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));

    expect(reorderMutate).toHaveBeenCalledWith(
      { groupId: 42, conditionIds: ['condition-b', 'condition-a'] },
      expect.any(Object)
    );
  });

  it('reflects saved vs unsaved state and per-row movement', async () => {
    render(<QuestionOrdering />);

    fireEvent.click(screen.getByRole('button', { name: /Test group/ }));
    await screen.findByText('Question A');

    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.queryByText(/moved · unsaved/)).not.toBeInTheDocument();
    expect(screen.queryByText(/was #/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move A after B' }));

    expect(await screen.findByText(/moved · unsaved/)).toBeInTheDocument();
    expect(screen.getAllByText(/was #/).length).toBeGreaterThan(0);
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();
  });

  it('shows loading until all conditions are hydrated', async () => {
    conditionsLoading = true;
    groupsData = [makeGroup({ hasMoreConditions: true })];

    render(<QuestionOrdering />);
    fireEvent.click(screen.getByRole('button', { name: /Test group/ }));

    expect(
      await screen.findByText(/Loading all public conditions/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Question A')).not.toBeInTheDocument();
  });

  it('saves the full hydrated membership for large groups', async () => {
    const tail: AdminConditionGroupCondition = {
      id: 'condition-c',
      question: 'Question C',
      shortName: null,
      optionName: null,
      similarMarketVolume: 300,
      displayOrder: 2,
    };
    groupsData = [makeGroup({ hasMoreConditions: true })];
    hydratedByGlobalId.set('gid-42', [...makeGroup().condition, tail]);

    render(<QuestionOrdering />);
    fireEvent.click(screen.getByRole('button', { name: /Test group/ }));
    await screen.findByText('Question C');

    fireEvent.click(screen.getByRole('button', { name: 'Move A after B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));

    expect(reorderMutate).toHaveBeenCalledWith(
      {
        groupId: 42,
        conditionIds: ['condition-b', 'condition-a', 'condition-c'],
      },
      expect.any(Object)
    );
  });
});
