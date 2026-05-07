/**
 * Sapience API submission logic
 */

import type {
  SapienceCondition,
  SapienceConditionGroup,
  SapienceOutput,
  SyncableFields,
  GroupMetadataUpdate,
} from '../types';
import { RESOLVER_ADDRESS, END_TIME_BUFFER_SECONDS } from '../constants';
import { fetchWithRetry, getAdminAuthHeaders } from '../utils';
import {
  runPipeline,
  printPipelineStats,
  API_GROUP_FILTERS,
  API_CONDITION_FILTERS,
  // matchesAlwaysIncludePatterns,
} from './pipeline';

/**
 * Delay between API submissions to avoid rate limiting
 */
const SUBMISSION_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Convert ISO date string to Unix timestamp (seconds)
 */
export function toUnixTimestamp(isoDate: string): number {
  return Math.floor(new Date(isoDate).getTime() / 1000);
}

/**
 * Submit a condition group to the API
 */
export async function submitConditionGroup(
  apiUrl: string,
  privateKey: `0x${string}`,
  group: SapienceConditionGroup
): Promise<{ success: boolean; error?: string }> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    const response = await fetchWithRetry(`${apiUrl}/admin/conditionGroups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        name: group.title, // API uses 'name' field
        categorySlug: group.categorySlug,
        similarMarkets: group.similarMarkets,
      }),
    });

    if (response.ok) {
      return { success: true };
    }

    // Handle duplicate groups gracefully (409 Conflict)
    if (response.status === 409) {
      return { success: true, error: 'Already exists (skipped)' };
    }

    const errorData = await response
      .json()
      .catch(() => ({ message: 'Unknown error' }));
    const errorMsg = `HTTP ${response.status}: ${errorData.message || response.statusText}`;
    console.error(`[Group] "${group.title}" submission failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Group] "${group.title}" submission error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Submit a condition to the API
 */
export async function submitCondition(
  apiUrl: string,
  privateKey: `0x${string}`,
  condition: SapienceCondition
): Promise<{ success: boolean; error?: string }> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    const response = await fetchWithRetry(`${apiUrl}/admin/conditions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        conditionHash: condition.conditionHash,
        question: condition.question,
        shortName: condition.shortName,
        optionName: condition.optionName,
        categorySlug: condition.categorySlug,
        endTime:
          (condition.endTimeOverride ?? toUnixTimestamp(condition.endDate)) +
          END_TIME_BUFFER_SECONDS,
        description: condition.description,
        similarMarkets: condition.similarMarkets,
        tags: condition.tags,
        chainId: condition.chainId,
        groupName: condition.groupTitle,
        resolver: RESOLVER_ADDRESS,
        public: true,
        estimatedPrice: condition.estimatedPrice,
        similarMarketVolume: condition.similarMarketVolume,
        similarMarketImage: condition.similarMarketImage,
      }),
    });

    if (response.ok) {
      return { success: true };
    }

    // Handle duplicate conditions gracefully (409 Conflict)
    if (response.status === 409) {
      return { success: true, error: 'Already exists (skipped)' };
    }

    const responseText = await response.text();
    console.error(`[Condition] Response body: ${responseText}`);
    let errorData = { message: 'Unknown error' };
    try {
      errorData = JSON.parse(responseText);
    } catch {
      /* ignore parse errors */
    }
    const errorMsg = `HTTP ${response.status}: ${errorData.message || response.statusText}`;
    console.error(
      `[Condition] ${condition.question} submission failed: ${errorMsg}`
    );
    return { success: false, error: errorMsg };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[Condition] ${condition.question} submission error: ${errorMsg}`
    );
    return { success: false, error: errorMsg };
  }
}

/**
 * Print what would be submitted in dry-run mode
 */
export function printDryRun(data: SapienceOutput): void {
  console.log('\n========== DRY RUN ==========\n');

  // Apply API filters pipeline to get included items
  const { output: includedGroups, stats: groupStats } = runPipeline(
    data.groups,
    API_GROUP_FILTERS,
    { verbose: false }
  );

  // For conditions, we need to filter each group's conditions and ungrouped
  const allConditions = [
    ...data.groups.flatMap((g) => g.conditions),
    ...data.ungroupedConditions,
  ];
  const { output: includedConditions, stats: conditionStats } = runPipeline(
    allConditions,
    API_CONDITION_FILTERS,
    { verbose: false }
  );

  console.log('API Submission Pipeline:');
  printPipelineStats(groupStats, 'Groups');
  printPipelineStats(conditionStats, 'Conditions');

  // Count unique group titles
  const uniqueGroupTitles = new Set(includedGroups.map((g) => g.title));

  console.log(
    `Would submit ${includedConditions.length} conditions across ${uniqueGroupTitles.size} unique groups\n`
  );

  // Print groups (deduplicated by title for display)
  if (includedGroups.length > 0) {
    console.log('Groups to create:');
    const seenTitles = new Set<string>();
    for (const group of includedGroups) {
      if (seenTitles.has(group.title)) continue;
      seenTitles.add(group.title);

      // Count conditions for this group title across all groups with same title
      const conditionsForGroup = includedGroups
        .filter((g) => g.title === group.title)
        .flatMap((g) => g.conditions);
      const { output: groupConditions } = runPipeline(
        conditionsForGroup,
        API_CONDITION_FILTERS
      );

      console.log(
        `  [${group.categorySlug}] "${group.title}" (${groupConditions.length} conditions)`
      );
      for (const condition of groupConditions) {
        const endDate = new Date(condition.endDate).toLocaleString();
        console.log(
          `    - ${condition.question.slice(0, 60)}${condition.question.length > 60 ? '...' : ''}`
        );
        console.log(
          `      End: ${endDate} | Hash: ${condition.conditionHash.slice(0, 10)}...`
        );
      }
    }
    console.log('');
  }

  // Print ungrouped conditions
  const { output: includedUngrouped } = runPipeline(
    data.ungroupedConditions,
    API_CONDITION_FILTERS
  );

  if (includedUngrouped.length > 0) {
    console.log('Ungrouped conditions to create:');
    for (const condition of includedUngrouped) {
      const endDate = new Date(condition.endDate).toLocaleString();
      console.log(
        `  [${condition.categorySlug}] ${condition.question.slice(0, 60)}${condition.question.length > 60 ? '...' : ''}`
      );
      console.log(
        `    End: ${endDate} | Hash: ${condition.conditionHash.slice(0, 10)}...`
      );
    }
    console.log('');
  }

  // Print skipped crypto
  const skippedCryptoGroups = data.groups.length - includedGroups.length;
  const skippedCryptoConditions =
    allConditions.length - includedConditions.length;

  if (skippedCryptoGroups > 0 || skippedCryptoConditions > 0) {
    console.log(
      `Would skip: ${skippedCryptoGroups} crypto groups, ${skippedCryptoConditions} crypto conditions`
    );
  }

  console.log('\n========== END DRY RUN ==========\n');
}

/**
 * Submit batch price updates for existing conditions
 */
export async function submitPriceUpdates(
  apiUrl: string,
  privateKey: `0x${string}`,
  priceUpdates: Array<{
    id: string;
    estimatedPrice: number;
    similarMarketVolume?: number;
    similarMarketImage?: string;
  }>
): Promise<void> {
  if (priceUpdates.length === 0) {
    console.log('[Prices] No price updates to submit');
    return;
  }

  const BATCH_SIZE = 200;
  let totalUpdated = 0;

  for (let i = 0; i < priceUpdates.length; i += BATCH_SIZE) {
    const batch = priceUpdates.slice(i, i + BATCH_SIZE);
    try {
      const authHeaders = await getAdminAuthHeaders(privateKey);
      const response = await fetchWithRetry(
        `${apiUrl}/admin/conditions/prices`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ updates: batch }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as { updated: number };
        totalUpdated += result.updated;
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        console.error(
          `[Prices] Batch ${i / BATCH_SIZE + 1} failed: HTTP ${response.status}: ${(errorData as { message?: string }).message || response.statusText}`
        );
      }
    } catch (error) {
      console.error(
        `[Prices] Batch ${i / BATCH_SIZE + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[Prices] Updated ${totalUpdated} of ${priceUpdates.length} conditions`
  );
}

/**
 * Submit batch volume updates for existing conditions.
 * Uses PUT /admin/conditions/volume.
 */
export async function submitVolumeUpdates<T extends { id: string }>(
  apiUrl: string,
  privateKey: `0x${string}`,
  volumeUpdates: T[]
): Promise<void> {
  if (volumeUpdates.length === 0) {
    console.log('[Volume] No volume updates to submit');
    return;
  }

  const BATCH_SIZE = 200;
  let totalUpdated = 0;

  for (let i = 0; i < volumeUpdates.length; i += BATCH_SIZE) {
    const batch = volumeUpdates.slice(i, i + BATCH_SIZE);
    try {
      const authHeaders = await getAdminAuthHeaders(privateKey);
      const response = await fetchWithRetry(
        `${apiUrl}/admin/conditions/volume`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ updates: batch }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as { updated: number };
        totalUpdated += result.updated;
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        console.error(
          `[Volume] Batch ${i / BATCH_SIZE + 1} failed: HTTP ${response.status}: ${(errorData as { message?: string }).message || response.statusText}`
        );
      }
    } catch (error) {
      console.error(
        `[Volume] Batch ${i / BATCH_SIZE + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[Volume] Updated ${totalUpdated} of ${volumeUpdates.length} conditions`
  );
}

/** API body limit — must match express.json({ limit }) in middleware.ts */
const API_BODY_LIMIT_BYTES = 100 * 1024; // 100KB

/** Safety margin to stay under the limit */
const BODY_LIMIT_HEADROOM = 0.9;

/**
 * Split payloads into batches that fit within the API body size limit.
 * Measures actual JSON size rather than using a fixed count.
 */
function batchBySize<T>(items: T[], maxBytes: number): T[][] {
  const limit = Math.floor(maxBytes * BODY_LIMIT_HEADROOM);
  const batches: T[][] = [];
  let current: T[] = [];
  let currentSize = 20; // overhead for `{"updates":[]}`

  for (const item of items) {
    const itemSize = JSON.stringify(item).length + 1; // +1 for comma
    if (current.length > 0 && currentSize + itemSize > limit) {
      batches.push(current);
      current = [];
      currentSize = 20;
    }
    current.push(item);
    currentSize += itemSize;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Submit metadata updates for existing conditions whose Polymarket
 * data has changed (e.g., renamed markets, changed slugs, new tags).
 * Uses PUT /admin/conditions/batch-metadata with dynamic batch sizing.
 */
export async function submitMetadataUpdates(
  apiUrl: string,
  privateKey: `0x${string}`,
  updates: Array<{
    conditionId: string;
    fields: SyncableFields;
  }>
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  console.log(`[Metadata] Submitting ${updates.length} metadata updates...`);

  // Convert to the batch-metadata payload format
  const payloads = updates.map((u) => ({
    id: u.conditionId,
    fields: u.fields,
  }));

  const batches = batchBySize(payloads, API_BODY_LIMIT_BYTES);
  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const authHeaders = await getAdminAuthHeaders(privateKey);
      const response = await fetchWithRetry(
        `${apiUrl}/admin/conditions/batch-metadata`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ updates: batch }),
        }
      );

      if (response.ok) {
        const result = (await response.json()) as {
          updated: number;
          failed: number;
        };
        totalUpdated += result.updated;
        totalFailed += result.failed;
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        console.error(
          `[Metadata] Batch ${i + 1} failed: HTTP ${response.status}: ${(errorData as { message?: string }).message || response.statusText}`
        );
        totalFailed += batch.length;
      }
    } catch (error) {
      console.error(
        `[Metadata] Batch ${i + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );
      totalFailed += batch.length;
    }

    if (i + 1 < batches.length) {
      await delay(SUBMISSION_DELAY_MS);
    }
  }

  console.log(
    `[Metadata] ${totalUpdated} updated, ${totalFailed} failed (${batches.length} batches)`
  );
}

/**
 * Submit metadata updates for existing condition groups whose Polymarket
 * data has changed (event slug renames, earlier broken URL format, etc.).
 * The admin API only exposes per-id updates, so this loops rather than
 * batching. Volume is low — one request per drifted group per run.
 */
export async function submitGroupMetadataUpdates(
  apiUrl: string,
  privateKey: `0x${string}`,
  updates: GroupMetadataUpdate[]
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  console.log(
    `[Metadata] Submitting ${updates.length} group metadata updates...`
  );

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    try {
      const authHeaders = await getAdminAuthHeaders(privateKey);
      const response = await fetchWithRetry(
        `${apiUrl}/admin/conditionGroups/${update.groupId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify(update.fields),
        }
      );

      if (response.ok) {
        updated++;
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ message: 'Unknown error' }));
        console.error(
          `[Metadata] Group ${update.groupId} failed: HTTP ${response.status}: ${(errorData as { message?: string }).message || response.statusText}`
        );
        failed++;
      }
    } catch (error) {
      console.error(
        `[Metadata] Group ${update.groupId} error:`,
        error instanceof Error ? error.message : String(error)
      );
      failed++;
    }

    if (i + 1 < updates.length) {
      await delay(SUBMISSION_DELAY_MS);
    }
  }

  console.log(`[Metadata] ${updated} groups updated, ${failed} failed`);
}

/**
 * Submit all condition groups and conditions to the API
 */
export async function submitToAPI(
  apiUrl: string,
  privateKey: `0x${string}`,
  data: SapienceOutput
): Promise<void> {
  console.log(`Submitting to API: ${apiUrl}`);

  // Apply API filters pipeline
  const { output: includedGroups, stats: groupStats } = runPipeline(
    data.groups,
    API_GROUP_FILTERS,
    { verbose: false }
  );
  printPipelineStats(groupStats, 'API Group Filter');

  const cryptoGroupsSkipped = data.groups.length - includedGroups.length;
  let cryptoConditionsSkipped = 0;

  // Collect all conditions into a flat list for batch submission
  const allConditions: SapienceCondition[] = [];

  for (const group of includedGroups) {
    const { output: includedConditions } = runPipeline(
      group.conditions,
      API_CONDITION_FILTERS
    );
    cryptoConditionsSkipped +=
      group.conditions.length - includedConditions.length;
    allConditions.push(...includedConditions);
  }

  // Add ungrouped conditions
  const { output: includedUngrouped } = runPipeline(
    data.ungroupedConditions,
    API_CONDITION_FILTERS
  );
  cryptoConditionsSkipped +=
    data.ungroupedConditions.length - includedUngrouped.length;
  allConditions.push(...includedUngrouped);

  if (allConditions.length === 0) {
    console.log('[API] No conditions to submit');
    return;
  }

  // Build batch payloads
  const payloads = allConditions.map((condition) => ({
    conditionHash: condition.conditionHash,
    question: condition.question,
    shortName: condition.shortName,
    optionName: condition.optionName,
    categorySlug: condition.categorySlug,
    endTime:
      (condition.endTimeOverride ?? toUnixTimestamp(condition.endDate)) +
      END_TIME_BUFFER_SECONDS,
    description: condition.description,
    similarMarkets: condition.similarMarkets,
    tags: condition.tags,
    chainId: condition.chainId,
    groupName: condition.groupTitle,
    resolver: RESOLVER_ADDRESS,
    estimatedPrice: condition.estimatedPrice,
    similarMarketVolume: condition.similarMarketVolume,
    similarMarketImage: condition.similarMarketImage,
  }));

  // Split into batches that fit within the API body size limit
  const batches = batchBySize(payloads, API_BODY_LIMIT_BYTES);
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const allFailedGroups = new Set<string>();

  async function submitBatches(batchList: (typeof payloads)[], label: string) {
    for (let batchIdx = 0; batchIdx < batchList.length; batchIdx++) {
      const batch = batchList[batchIdx];
      const batchNum = batchIdx + 1;

      try {
        const authHeaders = await getAdminAuthHeaders(privateKey);
        const response = await fetchWithRetry(
          `${apiUrl}/admin/conditions/batch-create`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders,
            },
            body: JSON.stringify({ conditions: batch }),
          }
        );

        if (response.ok) {
          const result = (await response.json()) as {
            created: number;
            skipped: number;
            failed: number;
            failedGroups?: string[];
          };
          totalCreated += result.created;
          totalSkipped += result.skipped;
          totalFailed += result.failed;
          if (result.failedGroups) {
            for (const g of result.failedGroups) allFailedGroups.add(g);
          }
          console.log(
            `${label} Batch ${batchNum}: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed${result.failedGroups?.length ? `, ${result.failedGroups.length} group(s) failed` : ''}`
          );
        } else {
          const errorData = await response
            .json()
            .catch(() => ({ message: 'Unknown error' }));
          console.error(
            `${label} Batch ${batchNum} failed: HTTP ${response.status}: ${(errorData as { message?: string }).message || response.statusText}`
          );
          totalFailed += batch.length;
        }
      } catch (error) {
        console.error(
          `${label} Batch ${batchNum} error:`,
          error instanceof Error ? error.message : String(error)
        );
        totalFailed += batch.length;
      }

      if (batchIdx + 1 < batchList.length) {
        await delay(SUBMISSION_DELAY_MS);
      }
    }
  }

  await submitBatches(batches, '[API]');

  // Retry conditions whose groups failed — the group creation may succeed
  // on a second attempt (transient DB error) and assign the group properly.
  if (allFailedGroups.size > 0) {
    const retryPayloads = payloads.filter(
      (p) => p.groupName && allFailedGroups.has(p.groupName)
    );
    if (retryPayloads.length > 0) {
      console.log(
        `[API] Retrying ${retryPayloads.length} conditions for ${allFailedGroups.size} failed group(s): ${[...allFailedGroups].join(', ')}`
      );
      await delay(1000); // brief pause before retry
      const retryBatches = batchBySize(retryPayloads, API_BODY_LIMIT_BYTES);
      await submitBatches(retryBatches, '[API Retry]');
    }
  }

  console.log(
    `[API] Submitted ${payloads.length} conditions in ${batches.length} batches (sizes: ${batches.map((b: unknown[]) => b.length).join(', ')})`
  );

  // Final summary
  const uniqueGroups = new Set(
    allConditions.map((c) => c.groupTitle).filter(Boolean)
  ).size;
  console.log(`Groups: ${uniqueGroups} unique (auto-created via batch-create)`);
  console.log(
    `Conditions: ${totalCreated} created, ${totalSkipped} skipped, ${totalFailed} failed`
  );
  if (cryptoGroupsSkipped > 0 || cryptoConditionsSkipped > 0) {
    console.log(
      `Crypto skipped: ${cryptoGroupsSkipped} groups, ${cryptoConditionsSkipped} conditions`
    );
  }
}
