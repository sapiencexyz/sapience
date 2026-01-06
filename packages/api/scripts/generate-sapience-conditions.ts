#!/usr/bin/env tsx
/// <reference types="node" />
/**
 * Generate Sapience condition groups and conditions from Polymarket markets
 * 
 * This script fetches Polymarket markets and formats them for the Sapience database:
 * - Uses Polymarket's conditionId as the Sapience conditionHash
 * - Groups related markets into ConditionGroups
 * - Adds Polymarket URLs to similarMarkets field
 * - Optionally submits to Sapience API if SAPIENCE_API_URL and ADMIN_PRIVATE_KEY are set
 * 
 * Usage: tsx packages/api/scripts/generate-sapience-conditions.ts
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// ============ Constants ============

// Placeholder resolver address - update this with actual resolver contract address
const RESOLVER_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// Ethereal chain ID (from @sapience/sdk/constants/chain.ts)
const CHAIN_ID_ETHEREAL = 5064014 as const;

// ============ Types ============

interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  outcomes: string[] | string;
  volume: string;
  liquidity: string;
  endDate: string;
  description: string;
  slug: string;
  marketSlug?: string;  // Alternative slug field
  url?: string;  // Direct URL from API
  category?: string;
  questionID?: string;
  sportsMarketType?: string;
  events?: Array<{
    slug?: string;
    seriesSlug?: string;
    series?: Array<{
      slug?: string;
      ticker?: string;
      title?: string;
    }>;
  }>;
  active: boolean;
  closed: boolean;
  groupItemTitle?: string;
  groupItemThreshold?: string;
  marketGroup?: string;
}

type SapienceCategorySlug =
  | 'crypto'
  | 'weather'
  | 'tech-science'
  | 'geopolitics'
  | 'economy-finance'
  | 'sports'
  | 'culture';

interface SapienceCondition {
  conditionHash: string;  // Polymarket's conditionId - used to resolve via LZ
  question: string;
  shortName: string;  // Short display name (using question since Polymarket doesn't provide one)
  categorySlug: SapienceCategorySlug;
  endDate: string;
  description: string;
  similarMarkets: string[];  // Polymarket URLs (slug is in the URL)
  chainId: number;  // Chain ID where condition will be deployed (Ethereal: 5064014)
  groupTitle?: string;  // Group title for API submission (API will find-or-create group by name)
}

interface SapienceConditionGroup {
  title: string;
  categorySlug: SapienceCategorySlug;
  description: string;
  conditions: SapienceCondition[];
}

interface SapienceOutput {
  metadata: {
    generatedAt: string;
    source: string;
    totalConditions: number;
    totalGroups: number;
    binaryConditions: number;
  };
  groups: SapienceConditionGroup[];
  ungroupedConditions: SapienceCondition[];
}

// ============ Category Inference ============

function inferSapienceCategorySlug(market: PolymarketMarket): SapienceCategorySlug {
  // Build normalized text for keyword matching
  const searchText = [
    market.question,
    market.slug,
    market.events?.[0]?.series?.[0]?.slug,
    market.events?.[0]?.series?.[0]?.title,
    market.events?.[0]?.seriesSlug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  
  // 1. Sports: Check sportsMarketType or series slugs
  if (market.sportsMarketType || 
      /\b(nba|nfl|nhl|mlb|epl|premier-league|uefa|fifa|world-cup|super-bowl|bowl|playoff|championship|bundesliga|la-liga|serie-a|ligue-1|champions-league|valorant|league-of-legends|dota|soccer|football|basketball|baseball|hockey|tennis|golf|ufc|boxing|mma|formula-1|cricket|rugby|buccaneers|chiefs|eagles|49ers|cowboys|packers|patriots|lakers|warriors|celtics|yankees|dodgers|mets|red-sox)\b/.test(searchText)) {
    return 'sports';
  }
  
  // 2. Crypto: Check for crypto keywords
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|crypto|cryptocurrency|blockchain|defi|nft|token|coin|satoshi)\b/.test(searchText)) {
    return 'crypto';
  }
  
  // 3. Weather: Check for weather/climate keywords
  if (/\b(weather|temperature|hottest|coldest|hurricane|tornado|flood|drought|rain|snow|climate|celsius|fahrenheit|el-nino)\b/.test(searchText)) {
    return 'weather';
  }
  
  // 4. Tech & Science: Check for tech/science keywords
  if (/\b(ai|artificial-intelligence|chatgpt|openai|tech|technology|science|nasa|space|spacex|tesla|apple|google|microsoft|amazon|meta|robot|quantum|semiconductor|chip)\b/.test(searchText)) {
    return 'tech-science';
  }
  
  // 5. Economy & Finance: Check for financial keywords
  if (/\b(stock|stocks|s&p|spx|dow|nasdaq|earning|market|fed|federal-reserve|interest-rate|inflation|gdp|economy|economic|finance|financial|bank|dollar|euro|yen|bond|treasury)\b/.test(searchText)) {
    return 'economy-finance';
  }
  
  // 6. Geopolitics: Check for politics/elections/war keywords
  if (/\b(election|president|presidential|senate|senator|congress|governor|prime-minister|parliament|vote|voting|poll|republican|democrat|party|political|politics|war|military|nato|ukraine|russia|china|israel|palestine|iran|korea|taiwan|diplomacy|treaty|sanction)\b/.test(searchText)) {
    return 'geopolitics';
  }
  
  // 7. Culture: Check for entertainment/celebrity keywords
  if (/\b(oscar|emmy|grammy|award|movie|film|music|album|celebrity|actor|actress|director|streaming|netflix|spotify|pop-culture|entertainment|fashion|art|artist)\b/.test(searchText)) {
    return 'culture';
  }
  
  // Default fallback: geopolitics (most common category for prediction markets)
  return 'geopolitics';
}

// ============ Utilities ============

function parseOutcomes(outcomes: string[] | string): string[] {
  if (Array.isArray(outcomes)) return outcomes;
  if (typeof outcomes === 'string') {
    try {
      const parsed = JSON.parse(outcomes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getPolymarketUrl(market: PolymarketMarket): string {
  // Simple reference URL with slug
  // Note: Polymarket URLs vary by market type (event, sports, etc.)
  // so we just provide a reference with the slug identifier
  return `https://polymarket.com#${market.slug}`;
}

// ============ Data Fetching ============

async function fetchPolymarketMarkets(limit: number = 100): Promise<PolymarketMarket[]> {
  try {
    console.log('📥 Fetching markets from Polymarket...');
    
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?limit=1000&closed=false&order=volume&ascending=false`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const markets: PolymarketMarket[] = await response.json();
    
    // Filter for binary markets only
    const binaryMarkets = markets
      .filter(m => parseOutcomes(m.outcomes).length === 2)
      .sort((a, b) => parseFloat(b.volume || '0') - parseFloat(a.volume || '0'))
      .slice(0, limit);
    
    console.log(`✅ Found ${binaryMarkets.length} binary markets (from ${markets.length} total)`);
    
    return binaryMarkets;
  } catch (error) {
    console.error('❌ Error fetching markets:', error);
    throw error;
  }
}

// ============ Data Transformation ============

/**
 * Compute group category by majority vote from its conditions
 */
function computeGroupCategory(conditions: SapienceCondition[]): SapienceCategorySlug {
  const counts = new Map<SapienceCategorySlug, number>();
  
  for (const condition of conditions) {
    counts.set(condition.categorySlug, (counts.get(condition.categorySlug) || 0) + 1);
  }
  
  // Find category with most votes
  let maxCount = 0;
  let majorityCategory: SapienceCategorySlug = 'geopolitics';
  
  for (const [category, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      majorityCategory = category;
    }
  }
  
  return majorityCategory;
}

function transformToSapienceCondition(market: PolymarketMarket, groupTitle?: string): SapienceCondition {
  return {
    conditionHash: market.conditionId,  // Use Polymarket's conditionId directly
    question: market.question,
    shortName: market.question,  // Polymarket doesn't provide shortName, use question
    endDate: market.endDate,
    description: market.description || '',
    similarMarkets: [getPolymarketUrl(market)],
    categorySlug: inferSapienceCategorySlug(market),
    chainId: CHAIN_ID_ETHEREAL,
    groupTitle,
  };
}

function groupMarkets(markets: PolymarketMarket[]): SapienceOutput {
  const groupsMap = new Map<string, PolymarketMarket[]>();
  const ungrouped: PolymarketMarket[] = [];
  
  // Separate grouped and ungrouped markets
  for (const market of markets) {
    if (market.groupItemTitle) {
      // Derive group title from the question
      // e.g., "Will X win the 2028 Presidential Election?" -> "2028 Presidential Election"
      const groupTitle = deriveGroupTitle(market);
      
      if (!groupsMap.has(groupTitle)) {
        groupsMap.set(groupTitle, []);
      }
      groupsMap.get(groupTitle)!.push(market);
    } else {
      ungrouped.push(market);
    }
  }
  
  // Create ConditionGroups
  const groups: SapienceConditionGroup[] = [];
  
  for (const [groupTitle, groupMarkets] of groupsMap) {
    const conditions = groupMarkets.map(m => transformToSapienceCondition(m, groupTitle));
    
    // Generate group description from first market
    const sampleDescription = groupMarkets[0]?.description || '';
    const groupDescription = sampleDescription.split('\n')[0] || groupTitle;
    
    // Compute group categorySlug by majority vote from conditions
    const categorySlug = computeGroupCategory(conditions);
    
    groups.push({
      title: groupTitle,
      description: groupDescription,
      categorySlug,
      conditions,
    });
  }
  
  // Sort groups by number of conditions (most popular)
  groups.sort((a, b) => b.conditions.length - a.conditions.length);
  
  // Create ungrouped conditions
  const ungroupedConditions = ungrouped.map(m => transformToSapienceCondition(m));
  
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'Polymarket Gamma API',
      totalConditions: markets.length,
      totalGroups: groups.length,
      binaryConditions: markets.length,
    },
    groups,
    ungroupedConditions,
  };
}

/**
 * Derive a group title from the market question
 * Examples:
 * - "Will X win the 2028 US Presidential Election?" -> "2028 US Presidential Election"
 * - "Will X win the 2025-26 Premier League?" -> "2025-26 Premier League"
 */
function deriveGroupTitle(market: PolymarketMarket): string {
  const question = market.question;
  
  // Common patterns
  const patterns = [
    /Will .+ (win|get|be|receive) (?:the )?(.+)\?/i,
    /Will .+ (?:in|from) (.+)\?/i,
  ];
  
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match) {
      let title = match[match.length - 1].trim();
      // Clean up common suffixes
      title = title.replace(/^(win|get|be|receive) /, '');
      return title;
    }
  }
  
  // Fallback: use groupItemTitle context
  if (market.groupItemTitle) {
    // Remove the item title from the question to get the group
    const cleaned = question.replace(market.groupItemTitle, '').replace(/^Will\s+/, '').replace(/\?$/, '');
    return cleaned.trim();
  }
  
  return 'Miscellaneous Markets';
}

// ============ Export Functions ============

function exportJSON(data: SapienceOutput, filename: string = 'sapience-conditions.json'): void {
  const outputPath = join(process.cwd(), filename);
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`\n✅ Exported to ${outputPath}`);
}

// ============ API Submission Functions ============

/**
 * Convert ISO date string to Unix timestamp (seconds)
 */
function toUnixTimestamp(isoDate: string): number {
  return Math.floor(new Date(isoDate).getTime() / 1000);
}

/**
 * Submit a condition group to the API
 */
async function submitConditionGroup(
  apiUrl: string,
  adminToken: string,
  group: SapienceConditionGroup
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${apiUrl}/admin/conditionGroups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: group.title, // API uses 'name' field
        categorySlug: group.categorySlug,
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
    return { success: false, error: errorData.message || `HTTP ${response.status}` };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Submit a condition to the API
 */
async function submitCondition(
  apiUrl: string,
  adminToken: string,
  condition: SapienceCondition
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${apiUrl}/admin/conditions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        conditionHash: condition.conditionHash, // Use Polymarket's conditionId directly as the condition ID
        question: condition.question,
        shortName: condition.shortName,
        categorySlug: condition.categorySlug,
        endTime: toUnixTimestamp(condition.endDate),
        description: condition.description,
        similarMarkets: condition.similarMarkets,
        chainId: condition.chainId,
        groupName: condition.groupTitle, // API will find or create the group
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

    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    return { success: false, error: errorData.message || `HTTP ${response.status}` };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Submit all condition groups and conditions to the API
 */
async function submitToAPI(
  apiUrl: string,
  adminToken: string,
  data: SapienceOutput
): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('\n📤 SUBMITTING TO SAPIENCE API\n');
  console.log(`   API URL: ${apiUrl}`);
  console.log(`   Total Groups: ${data.groups.length}`);
  console.log(`   Total Conditions: ${data.metadata.totalConditions}`);
  console.log('');

  let groupsCreated = 0;
  let groupsSkipped = 0;
  let groupsFailed = 0;
  let conditionsCreated = 0;
  let conditionsSkipped = 0;
  let conditionsFailed = 0;

  // Submit groups and their conditions
  for (const group of data.groups) {
    console.log(`\n📦 Group: ${group.title}`);
    
    // Submit the group
    const groupResult = await submitConditionGroup(apiUrl, adminToken, group);
    if (groupResult.success) {
      if (groupResult.error) {
        console.log(`   ⏭️  Group: ${groupResult.error}`);
        groupsSkipped++;
      } else {
        console.log(`   ✅ Group created`);
        groupsCreated++;
      }
    } else {
      console.log(`   ❌ Group failed: ${groupResult.error}`);
      groupsFailed++;
    }

    // Submit conditions in the group
    console.log(`   Submitting ${group.conditions.length} conditions...`);
    for (const condition of group.conditions) {
      const conditionResult = await submitCondition(apiUrl, adminToken, condition);
      if (conditionResult.success) {
        if (conditionResult.error) {
          conditionsSkipped++;
        } else {
          conditionsCreated++;
        }
      } else {
        console.log(`   ❌ "${condition.question.slice(0, 50)}...": ${conditionResult.error}`);
        conditionsFailed++;
      }
    }
    console.log(`   ✅ Conditions: ${conditionsCreated} created, ${conditionsSkipped} skipped, ${conditionsFailed} failed`);
  }

  // Submit ungrouped conditions
  if (data.ungroupedConditions.length > 0) {
    console.log(`\n📋 Ungrouped Conditions (${data.ungroupedConditions.length})`);
    for (const condition of data.ungroupedConditions) {
      const conditionResult = await submitCondition(apiUrl, adminToken, condition);
      if (conditionResult.success) {
        if (conditionResult.error) {
          conditionsSkipped++;
        } else {
          conditionsCreated++;
        }
      } else {
        console.log(`   ❌ "${condition.question.slice(0, 50)}...": ${conditionResult.error}`);
        conditionsFailed++;
      }
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SUBMISSION SUMMARY\n');
  console.log(`   Groups:`);
  console.log(`     ✅ Created: ${groupsCreated}`);
  console.log(`     ⏭️  Skipped: ${groupsSkipped}`);
  console.log(`     ❌ Failed: ${groupsFailed}`);
  console.log('');
  console.log(`   Conditions:`);
  console.log(`     ✅ Created: ${conditionsCreated}`);
  console.log(`     ⏭️  Skipped: ${conditionsSkipped}`);
  console.log(`     ❌ Failed: ${conditionsFailed}`);
  console.log('');
}

// ============ Display Functions ============

function displaySummary(data: SapienceOutput): void {
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SAPIENCE CONDITIONS SUMMARY\n');
  console.log(`   Total Conditions: ${data.metadata.totalConditions}`);
  console.log(`   Condition Groups: ${data.metadata.totalGroups}`);
  console.log(`   Ungrouped Conditions: ${data.ungroupedConditions.length}`);
  console.log(`   Binary Markets: ${data.metadata.binaryConditions}`);
  
  if (data.groups.length > 0) {
    console.log('\n📦 TOP 10 CONDITION GROUPS (by condition count):\n');
    data.groups.slice(0, 10).forEach((group, i) => {
      console.log(`   ${i + 1}. ${group.title}`);
      console.log(`      Conditions: ${group.conditions.length}`);
      console.log(`      Category: ${group.categorySlug}`);
      console.log('');
    });
  }
  
  console.log('\n📋 SAMPLE CONDITIONS:\n');
  const sampleConditions = [
    ...data.groups.slice(0, 2).flatMap(g => g.conditions.slice(0, 2)),
    ...data.ungroupedConditions.slice(0, 2),
  ].slice(0, 5);
  
  sampleConditions.forEach((condition, i) => {
    console.log(`   ${i + 1}. ${condition.question}`);
    console.log(`      Condition Hash: ${condition.conditionHash}`);
    console.log(`      End Date: ${new Date(condition.endDate).toLocaleDateString()}`);
    console.log(`      Similar Market: ${condition.similarMarkets[0]}`);
    if (condition.groupTitle) {
      console.log(`      Group: ${condition.groupTitle}`);
    }
    console.log('');
  });
}

// ============ Main ============

async function main() {
  console.log('🚀 Generating Sapience Conditions from Polymarket\n');
  
  // Check for API submission environment variables
  const apiUrl = process.env.SAPIENCE_API_URL;
  const adminToken = process.env.ADMIN_PRIVATE_KEY;
  const shouldSubmitToAPI = apiUrl && adminToken;
  
  if (shouldSubmitToAPI) {
    console.log('✅ API credentials detected - will submit to API');
    console.log(`   API URL: ${apiUrl}`);
    console.log(`   Resolver: ${RESOLVER_ADDRESS}\n`);
  } else {
    console.log('ℹ️  No API credentials - will only generate JSON file');
    console.log('   Set SAPIENCE_API_URL and ADMIN_PRIVATE_KEY to submit to API\n');
  }
  
  try {
    // Fetch Polymarket markets
    const markets = await fetchPolymarketMarkets(100);
    
    // Transform to Sapience structure
    console.log('\n🔄 Transforming to Sapience structure...');
    const sapienceData = groupMarkets(markets);
    
    // Display summary
    displaySummary(sapienceData);
    
    // Export JSON file
    console.log('\n💾 EXPORTING:\n');
    exportJSON(sapienceData);
    
    // Submit to API if credentials are available
    if (shouldSubmitToAPI && apiUrl && adminToken) {
      await submitToAPI(apiUrl, adminToken, sapienceData);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✨ NEXT STEPS:\n');
    
    if (shouldSubmitToAPI) {
      console.log('   ✅ Data submitted to Sapience API');
      console.log('   1. Check API logs for any errors');
      console.log('   2. Verify conditions in the database');
      console.log('   3. Use conditionHash with PredictionMarketLZConditionalTokensResolver');
      console.log('   4. The resolver will fetch results from Polymarket via LayerZero\n');
    } else {
      console.log('   1. Review sapience-conditions.json');
      console.log('   2. Set SAPIENCE_API_URL and ADMIN_PRIVATE_KEY environment variables');
      console.log('   3. Re-run script to submit to API, OR:');
      console.log('   4. Use conditionHash with PredictionMarketLZConditionalTokensResolver');
      console.log('   5. The resolver will fetch results from Polymarket via LayerZero\n');
    }
    
    console.log('📝 JSON STRUCTURE:\n');
    console.log('   {');
    console.log('     metadata: { totalConditions, totalGroups, ... },');
    console.log('     groups: [');
    console.log('       {');
    console.log('         title: "Group Title",');
    console.log('         categorySlug: "sports",');
    console.log('         description: "...",');
    console.log('         conditions: [ {...}, {...} ]');
    console.log('       }');
    console.log('     ],');
    console.log('     ungroupedConditions: [ {...}, {...} ]');
    console.log('   }\n');
    console.log('   Each Condition has:');
    console.log('     - conditionHash: Polymarket conditionId (bytes32)');
    console.log('     - question, endDate, description');
    console.log('     - similarMarkets: [Polymarket URLs]');
    console.log('     - groupTitle: parent group name (for grouped conditions)');
    console.log('     - All conditions are binary (Yes/No)\n');
    
    console.log('⚠️  IMPORTANT NOTES:\n');
    console.log('   - Resolver address is currently set to: ' + RESOLVER_ADDRESS);
    console.log('   - Update RESOLVER_ADDRESS constant with actual resolver contract');
    console.log('   - Chain ID: ' + CHAIN_ID_ETHEREAL + ' (Ethereal)');
    console.log('   - conditionHash (Polymarket conditionId) is used directly as condition ID');
    console.log('   - shortName is set to question (Polymarket doesn\'t provide shortName)');
    console.log('   - Duplicate submissions are handled gracefully (skipped)\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run
main();

