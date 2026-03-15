/**
 * One-off script to fix the category of a group and/or condition
 *
 * Usage:
 *   npx tsx fix-category.ts --group "PGA Tour: WM Phoenix Open Winner" --category sports
 *   npx tsx fix-category.ts --condition 0x1eff498e... --category sports
 *   npx tsx fix-category.ts --group "Group Name" --condition 0x... --category sports
 */

import 'dotenv/config';
import { getAdminAuthHeaders, validatePrivateKey, confirmProductionAccess } from '../src/utils';
import { fetchWithRetry } from '../src/utils/fetch';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';

const SAPIENCE_API_URL = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;

interface ConditionGroup {
  id: number;
  name: string;
  categoryId: number | null;
}

async function findGroupByName(
  apiUrl: string,
  privateKey: `0x${string}`,
  groupName: string
): Promise<ConditionGroup | null> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    const response = await fetchWithRetry(`${apiUrl}/admin/conditionGroups`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    });

    if (!response.ok) {
      console.error(`[FAIL] Failed to fetch groups: HTTP ${response.status}`);
      return null;
    }

    const groups: ConditionGroup[] = await response.json();
    return groups.find(g => g.name === groupName) || null;
  } catch (error) {
    console.error(`[FAIL] Error fetching groups: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function updateGroupCategory(
  apiUrl: string,
  privateKey: `0x${string}`,
  groupId: number,
  groupName: string,
  categorySlug: string
): Promise<boolean> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    // PUT /admin/conditionGroups/:id (numeric ID)
    const response = await fetchWithRetry(`${apiUrl}/admin/conditionGroups/${groupId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ categorySlug }),
    });

    if (response.ok) {
      console.log(`[OK] Updated group "${groupName}" (id: ${groupId}) to category: ${categorySlug}`);
      return true;
    }

    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error(`[FAIL] Group update failed: HTTP ${response.status}: ${errorData.message || response.statusText}`);
    return false;
  } catch (error) {
    console.error(`[FAIL] Group update error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function updateConditionCategory(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionHash: string,
  categorySlug: string
): Promise<boolean> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    // PUT /admin/conditions/:id (condition hash)
    const response = await fetchWithRetry(`${apiUrl}/admin/conditions/${conditionHash}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ categorySlug }),
    });

    if (response.ok) {
      console.log(`[OK] Updated condition "${conditionHash}" to category: ${categorySlug}`);
      return true;
    }

    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error(`[FAIL] Condition update failed: HTTP ${response.status}: ${errorData.message || response.statusText}`);
    return false;
  } catch (error) {
    console.error(`[FAIL] Condition update error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function parseArgs(): { group?: string; condition?: string; category: string } {
  const args = process.argv.slice(2);
  let group: string | undefined;
  let condition: string | undefined;
  let category: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--group' && args[i + 1]) {
      group = args[++i];
    } else if (args[i] === '--condition' && args[i + 1]) {
      condition = args[++i];
    } else if (args[i] === '--category' && args[i + 1]) {
      category = args[++i];
    }
  }

  if (!category) {
    console.error('Usage: npx tsx fix-category.ts --group "Group Name" --category <category>');
    console.error('       npx tsx fix-category.ts --condition <hash> --category <category>');
    console.error('\nCategories: crypto, weather, tech-science, geopolitics, economy-finance, sports, culture');
    process.exit(1);
  }

  if (!group && !condition) {
    console.error('Error: Must specify --group and/or --condition');
    process.exit(1);
  }

  return { group, condition, category };
}

async function main() {
  const { group, condition, category } = parseArgs();

  const privateKey = validatePrivateKey(process.env.ADMIN_PRIVATE_KEY);
  if (!privateKey) {
    console.error('Error: ADMIN_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  console.log(`API: ${SAPIENCE_API_URL}`);
  console.log(`Target category: ${category}`);
  console.log('');

  // Confirm production access if pointing to production without NODE_ENV=production
  await confirmProductionAccess(SAPIENCE_API_URL);

  let success = true;

  if (group) {
    console.log(`Looking up group: "${group}"`);
    const foundGroup = await findGroupByName(SAPIENCE_API_URL, privateKey, group);

    if (!foundGroup) {
      console.error(`[FAIL] Group not found: "${group}"`);
      success = false;
    } else {
      console.log(`Found group id: ${foundGroup.id}`);
      const ok = await updateGroupCategory(SAPIENCE_API_URL, privateKey, foundGroup.id, group, category);
      if (!ok) success = false;
    }
  }

  if (condition) {
    console.log(`Updating condition: ${condition}`);
    const ok = await updateConditionCategory(SAPIENCE_API_URL, privateKey, condition, category);
    if (!ok) success = false;
  }

  process.exit(success ? 0 : 1);
}

main();
