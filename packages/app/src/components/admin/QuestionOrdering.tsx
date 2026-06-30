'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { GripVertical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

import {
  useAdminConditionGroups,
  useReorderConditionGroup,
  type AdminConditionGroup,
  type AdminConditionGroupCondition,
} from '~/hooks/admin/useAdminConditionGroups';
import { cn } from '~/lib/utils/util';

const volumeFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

function conditionLabel(condition: AdminConditionGroupCondition): string {
  return condition.shortName ?? condition.optionName ?? condition.question;
}

// True when `next` is a reordering of `base` and nothing else — same length,
// same set of ids. Guards Save so it can never imply an add/remove.
function isPermutation(base: string[], next: string[]): boolean {
  if (base.length !== next.length) return false;
  const baseSet = new Set(base);
  return (
    next.every((id) => baseSet.has(id)) && new Set(next).size === next.length
  );
}

function SortableConditionRow({
  condition,
  position,
}: {
  condition: AdminConditionGroupCondition;
  position: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: condition.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-md border bg-background px-3 py-2',
        isDragging && 'opacity-70 shadow-sm'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{conditionLabel(condition)}</p>
        <p className="text-xs text-muted-foreground">
          {volumeFormatter.format(condition.similarMarketVolume)} Vol
        </p>
      </div>
    </div>
  );
}

const QuestionOrdering = () => {
  const { toast } = useToast();
  const { isConnected } = useAccount();

  const [groupFilter, setGroupFilter] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);

  // Loading reads the public GraphQL endpoint, so it is safe to fetch on mount
  // without a wallet or signature.
  const groupsQuery = useAdminConditionGroups(true);
  const reorderMutation = useReorderConditionGroup();

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  const filteredGroups = useMemo(() => {
    const query = groupFilter.trim().toLowerCase();
    const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    if (!query) return sorted;
    return sorted.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        String(group.id).includes(query)
    );
  }, [groups, groupFilter]);

  const selectedGroup: AdminConditionGroup | null = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const baselineIds = useMemo(
    () => selectedGroup?.condition.map((condition) => condition.id) ?? [],
    [selectedGroup]
  );

  // Reset the working order whenever a different group is selected or the
  // group's saved order changes (e.g. after a successful save refetch).
  useEffect(() => {
    setOrder(baselineIds);
  }, [baselineIds]);

  const conditionsById = useMemo(() => {
    const map = new Map<string, AdminConditionGroupCondition>();
    selectedGroup?.condition.forEach((condition) =>
      map.set(condition.id, condition)
    );
    return map;
  }, [selectedGroup]);

  const isDirty = useMemo(
    () => order.join(',') !== baselineIds.join(','),
    [order, baselineIds]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const handleSave = () => {
    if (selectedGroupId === null) return;
    // Defense in depth: only ever save a pure reordering of what we loaded.
    if (!isPermutation(baselineIds, order)) {
      toast({
        variant: 'destructive',
        title: 'Refusing to save',
        description:
          'The order is not a clean reordering of the loaded conditions.',
      });
      return;
    }
    reorderMutation.mutate(
      { groupId: selectedGroupId, conditionIds: order },
      {
        onSuccess: () => {
          toast({ title: 'Order saved' });
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: 'Failed to save order',
            description:
              error instanceof Error ? error.message : 'Please try again.',
          });
        },
      }
    );
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Question Ordering</h2>
          <p className="text-sm text-muted-foreground">
            Drag to set the display order of the questions shown within a group.
            Loading is read-only; saving requires an admin wallet signature and
            only updates display order.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => groupsQuery.refetch()}
          disabled={groupsQuery.isFetching}
        >
          Refresh
        </Button>
      </div>

      {groupsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading condition groups…
        </p>
      ) : groupsQuery.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-red-500">
            {groupsQuery.error instanceof Error
              ? groupsQuery.error.message
              : 'Failed to load condition groups.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => groupsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Input
              placeholder="Filter by name or id (e.g. 1017)"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            />
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  No groups match “{groupFilter}”.
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted',
                      selectedGroupId === group.id && 'border-primary bg-muted'
                    )}
                  >
                    <span className="min-w-0 truncate">{group.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      #{group.id} · {group.condition.length}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            {selectedGroup === null ? (
              <p className="text-sm text-muted-foreground">
                Select a group to reorder its questions.
              </p>
            ) : selectedGroup.condition.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This group has no public conditions.
              </p>
            ) : (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={order}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {order.map((conditionId, index) => {
                        const condition = conditionsById.get(conditionId);
                        if (!condition) return null;
                        return (
                          <SortableConditionRow
                            key={conditionId}
                            condition={condition}
                            position={index + 1}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!isDirty || reorderMutation.isPending}
                    onClick={() => setOrder(baselineIds)}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      !isDirty || !isConnected || reorderMutation.isPending
                    }
                    onClick={handleSave}
                  >
                    {reorderMutation.isPending ? 'Saving…' : 'Save order'}
                  </Button>
                </div>
                {!isConnected ? (
                  <p className="text-right text-xs text-muted-foreground">
                    Connect an admin wallet to save.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionOrdering;
