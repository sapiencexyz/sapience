'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@sapience/ui/components/ui/dialog';
import { Badge } from '@sapience/ui/components/ui/badge';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  GripVertical,
  Trash2,
} from 'lucide-react';

import DataTable from './data-table';
import { parseCsv, mapCsv } from '~/lib/utils/csv';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useCategories } from '~/hooks/graphql/useCategories';
import { useConditionGroups } from '~/hooks/graphql/useConditionGroups';
import type {
  ConditionGroupType,
  ConditionGroupConditionType,
} from '~/hooks/graphql/useConditionGroups';
import { useConditions } from '~/hooks/graphql/useConditions';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

const CATEGORY_NONE_VALUE = '__none__';

// Simple progress component
const Progress = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div
      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
      style={{ width: `${value}%` }}
    />
  </div>
);

type ConditionGroupRow = {
  id: number;
  name: string;
  category?: { id?: number; name?: string; slug?: string };
  conditionsCount: number;
  hasPublicConditions: boolean;
  conditions: ConditionGroupConditionType[];
};

type CSVRow = {
  name: string;
  categorySlug?: string;
  conditionIds?: string;
};

type ValidatedCSVRow = CSVRow & {
  rowIndex: number;
  isValid: boolean;
  errors: string[];
  parsedConditionIds?: string[];
};

type ConditionGroupsTabProps = {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  csvImportOpen?: boolean;
  onCsvImportOpenChange?: (open: boolean) => void;
  actionButtons?: React.ReactNode;
};

const ConditionGroupsTab = ({
  createOpen,
  setCreateOpen,
  csvImportOpen: csvImportOpenProp,
  onCsvImportOpenChange,
  actionButtons,
}: ConditionGroupsTabProps) => {
  const { toast } = useToast();
  const { postJson, putJson, deleteJson, getJson } = useAdminApi();
  const { data: categories } = useCategories();
  const currentChainId = useChainIdFromLocalStorage();

  const {
    data: conditionGroups,
    isLoading,
    error: conditionGroupsError,
    refetch,
  } = useConditionGroups({ take: 500, includeEmptyGroups: true });

  // Get all conditions for the manage conditions dialog
  const { data: allConditions } = useConditions({
    take: 1000,
    chainId: currentChainId,
  });

  // Form state
  const [name, setName] = useState('');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [editingId, setEditingId] = useState<number | undefined>(undefined);

  // Manage conditions dialog state
  const [manageConditionsOpen, setManageConditionsOpen] = useState(false);
  const [managingGroupId, setManagingGroupId] = useState<number | undefined>(
    undefined
  );
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>(
    []
  );

  // CSV Import state
  const [csvImportOpenInternal, setCsvImportOpenInternal] = useState(false);
  const csvImportOpen = csvImportOpenProp ?? csvImportOpenInternal;
  const setCsvImportOpen = onCsvImportOpenChange ?? setCsvImportOpenInternal;
  const [, setCsvFile] = useState<File | null>(null);
  const [validatedRows, setValidatedRows] = useState<ValidatedCSVRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const resetForm = () => {
    setName('');
    setCategorySlug('');
    setEditingId(undefined);
  };

  // CSV Import helper functions
  const validateCSVRow = (row: CSVRow, rowIndex: number): ValidatedCSVRow => {
    const errors: string[] = [];
    let parsedConditionIds: string[] | undefined;

    if (!row.name?.trim()) errors.push('Name is required');

    // Parse condition IDs
    if (row.conditionIds?.trim()) {
      parsedConditionIds = row.conditionIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }

    return {
      ...row,
      rowIndex,
      isValid: errors.length === 0,
      errors,
      parsedConditionIds,
    };
  };

  const handleFileUpload = async (file: File) => {
    setCsvFile(file);
    setValidatedRows([]);
    setImportResults(null);

    try {
      const text = await file.text();
      const { headers, rows, errors } = parseCsv(text, ',');
      if (errors.length > 0) {
        toast({
          variant: 'destructive',
          title: 'CSV Parsing Warning',
          description: errors.join(', '),
        });
      }

      const objects = mapCsv(headers, rows) as unknown as CSVRow[];
      const validated = objects.map((row: CSVRow, index: number) =>
        validateCSVRow(row, index + 1)
      );
      setValidatedRows(validated);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'CSV Read Error',
        description: (err as Error)?.message || 'Failed to read file',
      });
    }
  };

  const handleImport = async () => {
    const validRows = validatedRows.filter((row) => row.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportResults(null);

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        // Create the group
        const body: { name: string; categorySlug?: string } = {
          name: row.name.trim(),
        };
        if (row.categorySlug?.trim()) {
          body.categorySlug = row.categorySlug.trim();
        }

        const group = await postJson<{ id: number }>('/conditionGroups', body);

        // If condition IDs were provided, assign them
        if (row.parsedConditionIds && row.parsedConditionIds.length > 0) {
          await putJson(`/conditionGroups/${group.id}/conditions`, {
            conditionIds: row.parsedConditionIds,
          });
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${row.rowIndex}: ${(error as Error).message}`);
      }

      setImportProgress(((i + 1) / validRows.length) * 100);
    }

    setImportResults(results);
    setIsImporting(false);

    if (results.success > 0) {
      await refetch();
    }

    toast({
      title: 'Import Complete',
      description: `Successfully imported ${results.success} groups. ${results.failed} failed.`,
    });
  };

  const resetCsvImport = () => {
    setCsvFile(null);
    setValidatedRows([]);
    setImportResults(null);
    setImportProgress(0);
    setCsvImportOpen(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      await deleteJson(`/conditionGroups/${id}`);
      await refetch();
      toast({ title: 'Deleted', description: 'Condition group deleted' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error deleting group',
        description: (e as Error)?.message || 'Request failed',
      });
    }
  };

  const openManageConditions = async (groupId: number) => {
    setManagingGroupId(groupId);
    // Fetch the group to get current conditions
    try {
      const groups = await getJson<ConditionGroupType[]>('/conditionGroups');
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        setSelectedConditionIds(group.conditions.map((c) => c.id));
      }
    } catch {
      // If fetch fails, just open with empty
      setSelectedConditionIds([]);
    }
    setManageConditionsOpen(true);
  };

  const saveConditionAssignments = async () => {
    if (!managingGroupId) return;

    try {
      await putJson(`/conditionGroups/${managingGroupId}/conditions`, {
        conditionIds: selectedConditionIds,
      });
      await refetch();
      toast({
        title: 'Saved',
        description: 'Conditions updated successfully',
      });
      setManageConditionsOpen(false);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error updating conditions',
        description: (e as Error)?.message || 'Request failed',
      });
    }
  };

  const moveCondition = (index: number, direction: 'up' | 'down') => {
    const newIds = [...selectedConditionIds];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newIds.length) return;
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    setSelectedConditionIds(newIds);
  };

  const columns: ColumnDef<ConditionGroupRow>[] = useMemo(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        size: 200,
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (row) => row.category?.name ?? row.category?.slug ?? '',
        size: 150,
      },
      {
        header: '# Conditions',
        accessorKey: 'conditionsCount',
        size: 120,
        cell: ({ getValue }) => {
          const count = getValue() as number;
          return (
            <Badge variant="secondary">
              {count} {count === 1 ? 'condition' : 'conditions'}
            </Badge>
          );
        },
      },
      {
        header: 'Visibility',
        accessorKey: 'hasPublicConditions',
        size: 100,
        cell: ({ getValue }) => {
          const hasPublic = getValue() as boolean;
          return (
            <Badge variant={hasPublic ? 'default' : 'secondary'}>
              {hasPublic ? 'Public' : 'Private'}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 200,
        cell: ({ row }) => {
          const original = row.original;
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openManageConditions(original.id)}
              >
                Conditions
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingId(original.id);
                  setName(original.name);
                  setCategorySlug(original.category?.slug || '');
                  setCreateOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(original.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [toast]
  );

  const rows: ConditionGroupRow[] = useMemo(() => {
    return (conditionGroups || []).map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category || undefined,
      conditionsCount: g.conditions.length,
      hasPublicConditions: g.conditions.some((c) => c.public),
      conditions: g.conditions,
    }));
  }, [conditionGroups]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (editingId) {
        const body: { name?: string; categorySlug?: string | null } = {};
        if (name.trim()) body.name = name.trim();
        if (categorySlug) {
          body.categorySlug = categorySlug;
        } else {
          body.categorySlug = null;
        }
        await putJson(`/conditionGroups/${editingId}`, body);
        await refetch();
        toast({ title: 'Saved', description: 'Condition group updated' });
        setCreateOpen(false);
        resetForm();
      } else {
        const body: { name: string; categorySlug?: string } = {
          name: name.trim(),
        };
        if (categorySlug) body.categorySlug = categorySlug;
        await postJson('/conditionGroups', body);
        await refetch();
        toast({ title: 'Created', description: 'Condition group created' });
        setCreateOpen(false);
        resetForm();
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: editingId ? 'Error updating group' : 'Error creating group',
        description: (e as Error)?.message || 'Request failed',
      });
    }
  };

  // Get conditions not in any group for the manage dialog
  const availableConditions = useMemo(() => {
    if (!allConditions) return [];
    return allConditions.filter(
      (c) => !c.conditionGroupId || selectedConditionIds.includes(c.id)
    );
  }, [allConditions, selectedConditionIds]);

  return (
    <div className="space-y-4">
      {/* Filter and Action Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'group' : 'groups'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCsvImportOpenChange ? null : (
            <Button
              onClick={() => setCsvImportOpen(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          )}
          {actionButtons}
        </div>
      </div>

      {/* CSV Import Dialog */}
      <Dialog open={csvImportOpen} onOpenChange={setCsvImportOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Import Condition Groups from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import condition groups. The file should
              have the following columns:
              <code className="block mt-2 p-2 bg-muted rounded text-sm">
                name,categorySlug,conditionIds
              </code>
              <span className="block mt-1 text-xs">
                conditionIds is optional and should be comma-separated condition
                IDs (0x...)
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">CSV File</label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                disabled={isImporting}
              />
            </div>

            {validatedRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Preview & Validation</h3>
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {validatedRows.filter((r) => r.isValid).length} Valid
                    </Badge>
                    <Badge variant="destructive">
                      {validatedRows.filter((r) => !r.isValid).length} Invalid
                    </Badge>
                  </div>
                </div>

                <div className="border rounded-md max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left whitespace-nowrap">Row</th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Name
                        </th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Status
                        </th>
                        <th className="p-2 text-left whitespace-nowrap">
                          Errors
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {validatedRows.map((row) => (
                        <tr key={row.rowIndex} className="border-t">
                          <td className="p-2 font-mono">{row.rowIndex}</td>
                          <td className="p-2 max-w-xs truncate">{row.name}</td>
                          <td className="p-2">
                            {row.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                          </td>
                          <td className="p-2 max-w-xs">
                            {row.errors.length > 0 && (
                              <div className="text-red-600 text-xs">
                                {row.errors.join(', ')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isImporting && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Importing...</span>
                      <span>{Math.round(importProgress)}%</span>
                    </div>
                    <Progress value={importProgress} />
                  </div>
                )}

                {importResults && (
                  <div className="space-y-2 p-4 bg-muted/50 rounded-md">
                    <h4 className="font-medium">Import Results</h4>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">
                        ✓ {importResults.success} successful
                      </span>
                      <span className="text-red-600">
                        ✗ {importResults.failed} failed
                      </span>
                    </div>
                    {importResults.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-red-600">
                          Show errors ({importResults.errors.length})
                        </summary>
                        <div className="mt-2 max-h-32 overflow-y-auto">
                          {importResults.errors.map((error, index) => (
                            <div
                              key={index}
                              className="text-xs text-red-600 mb-1"
                            >
                              {error}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={resetCsvImport}
                    disabled={isImporting}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={
                      validatedRows.filter((r) => r.isValid).length === 0 ||
                      isImporting
                    }
                  >
                    {isImporting
                      ? 'Importing...'
                      : `Import ${validatedRows.filter((r) => r.isValid).length} Valid Rows`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Condition Group' : 'Create Condition Group'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                required
              />
            </div>
            {categories && categories.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Category (optional)
                </label>
                <Select
                  value={categorySlug || CATEGORY_NONE_VALUE}
                  onValueChange={(value) => {
                    setCategorySlug(value === CATEGORY_NONE_VALUE ? '' : value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CATEGORY_NONE_VALUE}>None</SelectItem>
                    {categories?.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Conditions Dialog */}
      <Dialog
        open={manageConditionsOpen}
        onOpenChange={setManageConditionsOpen}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Group Conditions</DialogTitle>
            <DialogDescription>
              Select and order conditions for this group. Drag to reorder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Selected conditions with ordering */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Selected Conditions ({selectedConditionIds.length})
              </label>
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {selectedConditionIds.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No conditions selected
                  </div>
                ) : (
                  <div className="divide-y">
                    {selectedConditionIds.map((id, index) => {
                      const condition = allConditions?.find((c) => c.id === id);
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 p-2 hover:bg-muted/50"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground">
                            {index + 1}.
                          </span>
                          <span className="flex-1 truncate text-sm">
                            {condition?.shortName || condition?.question || id}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveCondition(index, 'up')}
                              disabled={index === 0}
                            >
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveCondition(index, 'down')}
                              disabled={
                                index === selectedConditionIds.length - 1
                              }
                            >
                              ↓
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setSelectedConditionIds((ids) =>
                                  ids.filter((i) => i !== id)
                                )
                              }
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Available conditions to add */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Add Conditions</label>
              <Select
                value=""
                onValueChange={(value) => {
                  if (value && !selectedConditionIds.includes(value)) {
                    setSelectedConditionIds((ids) => [...ids, value]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a condition to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableConditions
                    ?.filter((c) => !selectedConditionIds.includes(c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.shortName || c.question}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setManageConditionsOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={saveConditionAssignments}>
                Save Assignments
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <DataTable columns={columns} data={rows} />
        {conditionGroupsError ? (
          <p className="text-sm text-red-500 mt-2">
            Failed to load condition groups: {conditionGroupsError.message}
          </p>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        ) : null}
      </div>
    </div>
  );
};

export default ConditionGroupsTab;
