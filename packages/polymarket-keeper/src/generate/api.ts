/**
 * Sapience API submission logic
 */

import type { SapienceCondition, SapienceConditionGroup, SapienceOutput } from '../types';
import { RESOLVER_ADDRESS } from '../constants';
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
const SUBMISSION_DELAY_MS = 300;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
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
        categorySlug: condition.categorySlug,
        endTime: toUnixTimestamp(condition.endDate),
        description: condition.description,
        similarMarkets: condition.similarMarkets,
        chainId: condition.chainId,
        groupName: condition.groupTitle,
        resolver: RESOLVER_ADDRESS,
        public: true,
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
    } catch {}
    const errorMsg = `HTTP ${response.status}: ${errorData.message || response.statusText}`;
    console.error(`[Condition] ${condition.question} submission failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Condition] ${condition.question} submission error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// /**
//  * Check if a condition should be included (not crypto OR always-include)
//  * @deprecated Use API_CONDITION_FILTERS pipeline instead
//  */
// export function shouldIncludeCondition(condition: SapienceCondition): boolean {
//   const isCrypto = condition.categorySlug === 'crypto';
//   const isAlwaysInclude = matchesAlwaysIncludePatterns(condition.question || '');
//   return !isCrypto || isAlwaysInclude;
// }

// /**
//  * Check if a group should be included (not crypto OR has always-include conditions)
//  * @deprecated Use API_GROUP_FILTERS pipeline instead
//  */
// export function shouldIncludeGroup(group: SapienceConditionGroup): boolean {
//   const isCrypto = group.categorySlug === 'crypto';
//   const hasAlwaysInclude = group.conditions.some(
//     c => matchesAlwaysIncludePatterns(c.question || '')
//   );
//   return !isCrypto || hasAlwaysInclude;
// }

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
    ...data.groups.flatMap(g => g.conditions),
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
  const uniqueGroupTitles = new Set(includedGroups.map(g => g.title));

  console.log(`Would submit ${includedConditions.length} conditions across ${uniqueGroupTitles.size} unique groups\n`);

  // Print groups (deduplicated by title for display)
  if (includedGroups.length > 0) {
    console.log('Groups to create:');
    const seenTitles = new Set<string>();
    for (const group of includedGroups) {
      if (seenTitles.has(group.title)) continue;
      seenTitles.add(group.title);

      // Count conditions for this group title across all groups with same title
      const conditionsForGroup = includedGroups
        .filter(g => g.title === group.title)
        .flatMap(g => g.conditions);
      const { output: groupConditions } = runPipeline(conditionsForGroup, API_CONDITION_FILTERS);

      console.log(`  [${group.categorySlug}] "${group.title}" (${groupConditions.length} conditions)`);
      for (const condition of groupConditions) {
        const endDate = new Date(condition.endDate).toLocaleString();
        console.log(`    - ${condition.question.slice(0, 60)}${condition.question.length > 60 ? '...' : ''}`);
        console.log(`      End: ${endDate} | Hash: ${condition.conditionHash.slice(0, 10)}...`);
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
      console.log(`  [${condition.categorySlug}] ${condition.question.slice(0, 60)}${condition.question.length > 60 ? '...' : ''}`);
      console.log(`    End: ${endDate} | Hash: ${condition.conditionHash.slice(0, 10)}...`);
    }
    console.log('');
  }

  // Print skipped crypto
  const skippedCryptoGroups = data.groups.length - includedGroups.length;
  const skippedCryptoConditions = allConditions.length - includedConditions.length;

  if (skippedCryptoGroups > 0 || skippedCryptoConditions > 0) {
    console.log(`Would skip: ${skippedCryptoGroups} crypto groups, ${skippedCryptoConditions} crypto conditions`);
  }

  console.log('\n========== END DRY RUN ==========\n');
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

  let groupsCreated = 0;
  let groupsSkipped = 0;
  let groupsFailed = 0;
  let conditionsCreated = 0;
  let conditionsSkipped = 0;
  let conditionsFailed = 0;

  const cryptoGroupsSkipped = data.groups.length - includedGroups.length;
  let cryptoConditionsSkipped = 0;

  // Track submitted group titles to avoid duplicate API calls within this run
  // (Multiple markets from same event each create a group with same title)
  const submittedGroupTitles = new Set<string>();

  // Submit groups and their conditions
  for (const group of includedGroups) {
    // Only submit group if we haven't already in this run
    if (!submittedGroupTitles.has(group.title)) {
      const groupResult = await submitConditionGroup(apiUrl, privateKey, group);
      submittedGroupTitles.add(group.title);
      if (groupResult.success) {
        if (groupResult.error) {
          groupsSkipped++;
        } else {
          groupsCreated++;
          console.log(`[API] Created group: "${group.title}"`);
        }
      } else {
        groupsFailed++;
      }
      await delay(SUBMISSION_DELAY_MS);
    }

    // Filter conditions through pipeline
    const { output: includedConditions } = runPipeline(
      group.conditions,
      API_CONDITION_FILTERS
    );
    cryptoConditionsSkipped += group.conditions.length - includedConditions.length;

    // Always submit conditions (they link to group via groupName field)
    for (const condition of includedConditions) {
      const conditionResult = await submitCondition(apiUrl, privateKey, condition);

      if (conditionResult.success) {
        if (conditionResult.error) {
          conditionsSkipped++;
        } else {
          conditionsCreated++;
          console.log(`[API] Created condition: "${condition.question.slice(0, 50)}${condition.question.length > 50 ? '...' : ''}"`);
        }
      } else {
        conditionsFailed++;
      }
      await delay(SUBMISSION_DELAY_MS);
    }
  }

  // Submit ungrouped conditions
  const { output: includedUngrouped } = runPipeline(
    data.ungroupedConditions,
    API_CONDITION_FILTERS
  );
  cryptoConditionsSkipped += data.ungroupedConditions.length - includedUngrouped.length;

  for (const condition of includedUngrouped) {
    const conditionResult = await submitCondition(apiUrl, privateKey, condition);
    if (conditionResult.success) {
      if (conditionResult.error) {
        conditionsSkipped++;
      } else {
        conditionsCreated++;
        console.log(`[API] Created condition: "${condition.question.slice(0, 50)}${condition.question.length > 50 ? '...' : ''}" (ungrouped)`);
      }
    } else {
      conditionsFailed++;
    }
    await delay(SUBMISSION_DELAY_MS);
  }

  // Final summary
  const uniqueGroupsSubmitted = submittedGroupTitles.size;
  console.log(`Groups: ${uniqueGroupsSubmitted} unique (${groupsCreated} created, ${groupsSkipped} already existed, ${groupsFailed} failed)`);
  console.log(`Conditions: ${conditionsCreated} created, ${conditionsSkipped} skipped, ${conditionsFailed} failed`);
  if (cryptoGroupsSkipped > 0 || cryptoConditionsSkipped > 0) {
    console.log(`Crypto skipped: ${cryptoGroupsSkipped} groups, ${cryptoConditionsSkipped} conditions`);
  }
}
