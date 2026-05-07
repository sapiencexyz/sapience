import { isAddress } from 'viem';

export type ConditionCsvRow = {
  question: string;
  categorySlug?: string;
  endTimeUTC: string;
  public?: string;
  description: string;
  shortName?: string;
  similarMarkets?: string;
  group?: string;
  resolver: string;
};

export type ValidatedConditionCsvRow = ConditionCsvRow & {
  rowIndex: number;
  isValid: boolean;
  errors: string[];
  parsedEndTime?: number;
  parsedPublic?: boolean;
  parsedSimilarMarkets?: string[];
  parsedGroup?: string;
  parsedResolver?: string;
};

// Validates a condition import row and projects the parsed/normalized form.
// Pure — safe to call outside of React. `rowIndex` is propagated so callers
// can build human-readable error messages ("Row 3: ...").
export function validateConditionCsvRow(
  row: ConditionCsvRow,
  rowIndex: number
): ValidatedConditionCsvRow {
  const errors: string[] = [];
  let parsedEndTime: number | undefined;
  let parsedPublic: boolean | undefined;
  let parsedSimilarMarkets: string[] | undefined;
  let parsedResolver: string | undefined;

  if (!row.question?.trim()) errors.push('Question is required');
  if (!row.endTimeUTC?.trim()) errors.push('End time is required');
  if (!row.description?.trim()) errors.push('Description is required');
  if (!row.resolver?.trim()) {
    errors.push('Resolver address is required');
  } else {
    const trimmedResolver = row.resolver.trim();
    if (!isAddress(trimmedResolver as `0x${string}`)) {
      errors.push('Resolver must be a valid Ethereum address (0x...)');
    } else {
      parsedResolver = trimmedResolver.toLowerCase();
    }
  }

  if (row.endTimeUTC?.trim()) {
    const timestamp = parseInt(row.endTimeUTC.trim(), 10);
    if (Number.isNaN(timestamp)) {
      errors.push('End time must be a valid Unix timestamp');
    } else if (timestamp <= Math.floor(Date.now() / 1000)) {
      errors.push('End time must be in the future');
    } else {
      parsedEndTime = timestamp;
    }
  }

  if (row.public !== undefined && row.public !== '') {
    const publicValue = row.public.toLowerCase().trim();
    if (publicValue === 'true') {
      parsedPublic = true;
    } else if (publicValue === 'false') {
      parsedPublic = false;
    } else {
      errors.push('Public must be "true" or "false"');
    }
  } else {
    parsedPublic = true;
  }

  if (row.similarMarkets?.trim()) {
    parsedSimilarMarkets = row.similarMarkets
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
  }

  const parsedGroup = row.group?.trim() || undefined;

  return {
    ...row,
    rowIndex,
    isValid: errors.length === 0,
    errors,
    parsedEndTime,
    parsedPublic,
    parsedSimilarMarkets,
    parsedGroup,
    parsedResolver,
  };
}
