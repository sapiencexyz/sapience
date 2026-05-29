import { Request, Response, Router } from 'express';
import prisma from '../core/db';
import { createLogger } from '../core/logger';
import {
  resolveOrCreateGroup,
  resolveGroupsForBatch,
  pickGroupForPayload,
} from './helpers/conditionGroupIdentity';

const log = createLogger('routes.conditions');

const router = Router();

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// AP-style title-case "small words" that stay lowercase when they're
// neither the first nor the last word. Articles, coordinating
// conjunctions, and prepositions ≤ 3 letters. Includes "vs" (sports
// journalism convention) and "x" (Polymarket matchup separator).
const TITLE_CASE_SMALL_WORDS = new Set([
  // Articles
  'a',
  'an',
  'the',
  // Coordinating conjunctions
  'and',
  'but',
  'for',
  'nor',
  'or',
  'so',
  'yet',
  // Short prepositions (≤3 letters)
  'as',
  'at',
  'by',
  'in',
  'of',
  'off',
  'on',
  'per',
  'to',
  'up',
  'via',
  // Domain-specific
  'vs',
  'x',
]);

// AP-style Title Case. Each word:
//   1) Acronym/mixed-case preservation — any word containing an
//      uppercase letter is left alone (UFC, NFL, DeFi, iOS, F1, U.S.).
//   2) First and last words are always capitalized (even if they're
//      small words: "Of Mice and Men", "Things to Come To").
//   3) Small-word skip — articles, coord. conjunctions, ≤3-letter
//      prepositions stay lowercase. ALL-CAPS forms ("OR" the Oregon
//      state code) bypass this and are treated as acronyms.
// Splits on space only — hyphenated tags like "updated-tag" stay as
// one word ("Updated-tag").
// Mirrors normalizeTagLabel in packages/market-keeper/src/generate/tags.ts.
function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => {
      const words = t.split(' ');
      return words
        .map((w, i) => {
          const isFirst = i === 0;
          const isLast = i === words.length - 1;
          const isAllUpper = /[A-Z]/.test(w) && w === w.toUpperCase();
          if (
            !isFirst &&
            !isLast &&
            !isAllUpper &&
            TITLE_CASE_SMALL_WORDS.has(w.toLowerCase())
          ) {
            return w.toLowerCase();
          }
          if (/[A-Z]/.test(w)) return w;
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(' ');
    });
}

function normalizeNegRiskMarketId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Group-level basket invariant.
 *
 * Conditions don't store negRisk metadata; the only persisted truth is
 * `condition_group.negRiskMarketId`. The first condition assigned to a
 * group decides that id (null or otherwise); every subsequent admission
 * has to match exactly — null included. There's no asymmetric "anything
 * goes" relaxation: a basket condition trying to slip into a non-basket
 * group is just as wrong as the reverse.
 *
 * Guards admission only. Conditions already linked to the group are
 * grandfathered (a routine metadata edit shouldn't have to restate the
 * basket id every time).
 */
function basketsAgree(
  groupBasket: string | null,
  payloadBasket: string | null
): boolean {
  return payloadBasket === groupBasket;
}

type NegRiskMismatchType = 'EXISTING_GROUP_MISMATCH' | 'NEW_GROUP_INCOHERENT';

type NegRiskMismatch = {
  type: NegRiskMismatchType;
  groupName: string;
  expectedNegRiskMarketId: string | null;
  mismatched: Array<{
    conditionHash: string;
    actualNegRiskMarketId: string | null;
  }>;
};

function negRiskMismatchPayload(
  message: string,
  mismatches: NegRiskMismatch[]
) {
  return {
    code: 'NEG_RISK_BASKET_MISMATCH',
    message,
    mismatches,
  };
}

// GET route removed in favor of GraphQL. Use GraphQL `conditions` query for reads.

interface BatchCreateConditionInput {
  conditionHash: string;
  question: string;
  shortName?: string;
  optionName?: string;
  categorySlug?: string;
  endTime: number;
  description: string;
  similarMarkets?: string[];
  tags?: string[];
  chainId?: number;
  groupName?: string;
  /**
   * Polymarket event id (events[0].id from Gamma /markets). When present,
   * the admin route looks up groups by (source, externalEventId) instead
   * of by name. Absent payloads fall through the legacy name-keyed path.
   */
  externalEventId?: string | null;
  resolver: string;
  estimatedPrice?: number;
  similarMarketVolume?: number;
  similarMarketImage?: string;
  negRisk?: boolean;
  negRiskMarketId?: string | null;
}

// POST /admin/conditions/batch-create - batch create conditions (with auto group creation)
// NOTE: Must be registered before /:id and the single POST / route
router.post('/batch-create', async (req: Request, res: Response) => {
  try {
    const { conditions: items } = req.body as {
      conditions?: BatchCreateConditionInput[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: 'conditions must be a non-empty array' });
    }

    // No count limit — the express.json body parser (100KB) is the effective cap.
    // The keeper uses batchBySize() to stay under the body limit dynamically.

    // Validate all items upfront before touching DB
    for (const item of items) {
      if (
        !item.conditionHash ||
        !/^0x[0-9a-fA-F]{64}$/.test(item.conditionHash)
      ) {
        return res.status(400).json({
          message: `Invalid conditionHash: ${item.conditionHash}`,
        });
      }
      if (!item.question || !item.endTime || !item.description) {
        return res.status(400).json({
          message: `Missing required fields for ${item.conditionHash}`,
        });
      }
      if (!item.resolver || !/^0x[a-fA-F0-9]{40}$/.test(item.resolver)) {
        return res.status(400).json({
          message: `Invalid resolver for ${item.conditionHash}`,
        });
      }
      if (
        item.negRisk === true &&
        !normalizeNegRiskMarketId(item.negRiskMarketId)
      ) {
        return res.status(400).json({
          message: `negRiskMarketId is required for negRisk condition ${item.conditionHash}`,
        });
      }
      const endTimeInt = parseInt(String(item.endTime), 10);
      if (Number.isNaN(endTimeInt)) {
        return res.status(400).json({
          message: `endTime must be a valid Unix timestamp for ${item.conditionHash}`,
        });
      }
    }

    // Resolve category slugs (batch lookup)
    const uniqueSlugs = [
      ...new Set(items.map((i) => i.categorySlug).filter(Boolean)),
    ] as string[];
    const categories =
      uniqueSlugs.length > 0
        ? await prisma.category.findMany({
            where: { slug: { in: uniqueSlugs } },
          })
        : [];
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    // Resolve or create groups. Identity precedence per item:
    //   - if externalEventId is present → (source, externalEventId) keyed
    //   - else → name-keyed (legacy / non-Polymarket / curated)
    // Items sharing the same identity key belong to the same group.
    const itemIdentityKey = (
      i: BatchCreateConditionInput
    ): string | undefined => {
      const eid = i.externalEventId?.trim();
      if (eid) return `event:${eid}`;
      const n = i.groupName?.trim();
      if (n) return `name:${n}`;
      return undefined;
    };
    const itemsByIdentity = new Map<string, BatchCreateConditionInput[]>();
    const identityPayloads = new Map<
      string,
      { groupName?: string; externalEventId?: string | null }
    >();
    for (const item of items) {
      const key = itemIdentityKey(item);
      if (!key) continue;
      let bucket = itemsByIdentity.get(key);
      if (!bucket) {
        bucket = [];
        itemsByIdentity.set(key, bucket);
        identityPayloads.set(key, {
          groupName: item.groupName?.trim(),
          externalEventId: item.externalEventId,
        });
      }
      bucket.push(item);
    }

    const maps = await resolveGroupsForBatch(
      [...identityPayloads.values()],
      'polymarket'
    );
    const groupIdByIdentity = new Map<string, number>();

    // For groups that already exist in the DB, every incoming item must
    // match the stored basket id exactly (null included). Reject the batch
    // up front so we don't half-apply.
    for (const [identityKey, groupItems] of itemsByIdentity) {
      const payload = identityPayloads.get(identityKey)!;
      const existingGroup = pickGroupForPayload(payload, maps, 'polymarket');
      if (!existingGroup) continue;
      groupIdByIdentity.set(identityKey, existingGroup.id);
      const displayName = payload.groupName ?? existingGroup.name;
      const mismatched = groupItems.filter(
        (item) =>
          !basketsAgree(
            existingGroup.negRiskMarketId,
            normalizeNegRiskMarketId(item.negRiskMarketId)
          )
      );
      if (mismatched.length > 0) {
        log.warn(
          `[BatchCreate] rejected ${mismatched.length} condition(s) for ` +
            `group "${displayName}" (basket=${existingGroup.negRiskMarketId ?? 'none'}): ` +
            mismatched
              .map(
                (item) =>
                  `${item.conditionHash}=${item.negRiskMarketId ?? 'none'}`
              )
              .join(', ')
        );
        return res.status(400).json({
          ...negRiskMismatchPayload(
            `Cannot add non-matching negRisk conditions to negRisk group ${displayName}. ` +
              `Expected negRiskMarketId ${existingGroup.negRiskMarketId ?? 'null'}; ` +
              `mismatched: ${mismatched.map((item) => item.conditionHash).join(', ')}`,
            [
              {
                type: 'EXISTING_GROUP_MISMATCH',
                groupName: displayName,
                expectedNegRiskMarketId: existingGroup.negRiskMarketId,
                mismatched: mismatched.map((item) => ({
                  conditionHash: item.conditionHash,
                  actualNegRiskMarketId: normalizeNegRiskMarketId(
                    item.negRiskMarketId
                  ),
                })),
              },
            ]
          ),
        });
      }
    }

    // Create missing groups. Leader-takes-all: the first item in the batch
    // that names a new group stamps its basket id (or null) onto the group,
    // and every other item in the same batch+group is then validated against
    // that stamp the same way an existing-group admission would be.
    const failedGroups: string[] = [];
    for (const [identityKey, groupItems] of itemsByIdentity) {
      if (groupIdByIdentity.has(identityKey)) continue;
      const payload = identityPayloads.get(identityKey)!;
      const firstItem = groupItems[0];
      const leaderBasket = normalizeNegRiskMarketId(firstItem?.negRiskMarketId);
      // The DB column requires a name. For event-keyed payloads we expect
      // the keeper to send groupName alongside externalEventId — both
      // come from the same Polymarket event. If groupName is somehow
      // missing, fall back to a deterministic synthetic name.
      const nameForCreate =
        payload.groupName?.trim() ||
        (payload.externalEventId
          ? `polymarket-event-${payload.externalEventId}`
          : null);
      if (!nameForCreate) {
        // Should be unreachable — itemIdentityKey requires one of the two.
        failedGroups.push(identityKey);
        continue;
      }
      const mismatched = groupItems
        .slice(1)
        .filter(
          (item) =>
            !basketsAgree(
              leaderBasket,
              normalizeNegRiskMarketId(item.negRiskMarketId)
            )
        );
      if (mismatched.length > 0) {
        log.warn(
          `[BatchCreate] rejected ${mismatched.length} condition(s) for new ` +
            `group "${nameForCreate}" (leader basket=${leaderBasket ?? 'none'}): ` +
            mismatched
              .map(
                (item) =>
                  `${item.conditionHash}=${item.negRiskMarketId ?? 'none'}`
              )
              .join(', ')
        );
        return res.status(400).json({
          ...negRiskMismatchPayload(
            `Cannot add non-matching negRisk conditions to negRisk group ${nameForCreate}. ` +
              `Expected negRiskMarketId ${leaderBasket ?? 'null'}; ` +
              `mismatched: ${mismatched.map((item) => item.conditionHash).join(', ')}`,
            [
              {
                type: 'NEW_GROUP_INCOHERENT',
                groupName: nameForCreate,
                expectedNegRiskMarketId: leaderBasket,
                mismatched: mismatched.map((item) => ({
                  conditionHash: item.conditionHash,
                  actualNegRiskMarketId: normalizeNegRiskMarketId(
                    item.negRiskMarketId
                  ),
                })),
              },
            ]
          ),
        });
      }
      const categoryId = firstItem?.categorySlug
        ? (categoryBySlug.get(firstItem.categorySlug) ?? null)
        : null;
      try {
        const group = await resolveOrCreateGroup({
          name: nameForCreate,
          externalEventId: payload.externalEventId,
          negRiskMarketId: leaderBasket,
          categoryId,
        });
        // resolveOrCreateGroup may have returned an existing group via the
        // (source, externalEventId) race fallback. Re-validate the
        // invariant the same way an existing-group admission would.
        const raceMismatched = groupItems.filter(
          (item) =>
            !basketsAgree(
              group.negRiskMarketId,
              normalizeNegRiskMarketId(item.negRiskMarketId)
            )
        );
        if (raceMismatched.length > 0) {
          return res.status(400).json({
            ...negRiskMismatchPayload(
              `Cannot add non-matching negRisk conditions to negRisk group ${nameForCreate}. ` +
                `Expected negRiskMarketId ${group.negRiskMarketId ?? 'null'}; ` +
                `mismatched: ${raceMismatched
                  .map((item) => item.conditionHash)
                  .join(', ')}`,
              [
                {
                  type: 'EXISTING_GROUP_MISMATCH',
                  groupName: nameForCreate,
                  expectedNegRiskMarketId: group.negRiskMarketId,
                  mismatched: raceMismatched.map((item) => ({
                    conditionHash: item.conditionHash,
                    actualNegRiskMarketId: normalizeNegRiskMarketId(
                      item.negRiskMarketId
                    ),
                  })),
                },
              ]
            ),
          });
        }
        groupIdByIdentity.set(identityKey, group.id);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        log.error(
          `[BatchCreate] Failed to create group "${nameForCreate}": ${message}`
        );
        failedGroups.push(nameForCreate);
      }
    }

    // Create conditions
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      const categoryId = item.categorySlug
        ? (categoryBySlug.get(item.categorySlug) ?? null)
        : null;
      const itemKey = itemIdentityKey(item);
      const groupId = itemKey ? (groupIdByIdentity.get(itemKey) ?? null) : null;

      try {
        await prisma.condition.create({
          data: {
            id: item.conditionHash,
            question: item.question,
            shortName: item.shortName?.trim() || undefined,
            optionName: item.optionName?.trim() || undefined,
            categoryId: categoryId ?? undefined,
            endTime: parseInt(String(item.endTime), 10),
            public: true,
            description: item.description,
            similarMarkets: Array.isArray(item.similarMarkets)
              ? item.similarMarkets
              : [],
            tags: normalizeTags(item.tags),
            chainId: item.chainId ?? 42161,
            estimatedPrice:
              typeof item.estimatedPrice === 'number' &&
              item.estimatedPrice >= 0 &&
              item.estimatedPrice <= 1
                ? item.estimatedPrice
                : undefined,
            similarMarketVolume:
              typeof item.similarMarketVolume === 'number' &&
              item.similarMarketVolume >= 0
                ? item.similarMarketVolume
                : undefined,
            similarMarketImage:
              typeof item.similarMarketImage === 'string' &&
              isHttpUrl(item.similarMarketImage)
                ? item.similarMarketImage
                : undefined,
            conditionGroupId: groupId ?? undefined,
            displayOrder: groupId ? 0 : undefined,
            resolver: item.resolver.toLowerCase(),
          },
        });
        created++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('Unique constraint')) {
          skipped++;
        } else {
          log.error(`[BatchCreate] Failed ${item.conditionHash}: ${message}`);
          failed++;
        }
      }
    }

    return res.status(201).json({
      created,
      skipped,
      failed,
      ...(failedGroups.length > 0 ? { failedGroups } : {}),
    });
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in batch create conditions:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /admin/conditions - create a condition
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      conditionHash,
      question,
      shortName,
      optionName,
      categoryId,
      categorySlug,
      endTime,
      public: isPublic = true,
      description,
      similarMarkets,
      chainId,
      groupName,
      externalEventId,
      resolver,
      tags,
      estimatedPrice,
      similarMarketVolume,
      similarMarketImage,
      negRisk,
      negRiskMarketId,
    } = req.body as {
      conditionHash?: string;
      question?: string;
      shortName?: string;
      optionName?: string;
      categoryId?: number;
      categorySlug?: string;
      endTime?: number | string;
      public?: boolean;
      description?: string;
      similarMarkets?: string[];
      chainId?: number;
      groupName?: string;
      externalEventId?: string | null;
      resolver?: string;
      tags?: string[];
      estimatedPrice?: number;
      similarMarketVolume?: number;
      similarMarketImage?: string;
      negRisk?: boolean;
      negRiskMarketId?: string | null;
    };

    // conditionHash is required (must be 0x-prefixed 32-byte hex)
    if (!conditionHash || !/^0x[0-9a-fA-F]{64}$/.test(conditionHash)) {
      return res.status(400).json({
        message:
          'conditionHash is required and must be a 0x-prefixed 32-byte hex string',
      });
    }

    if (!question || !endTime || !description) {
      return res.status(400).json({
        message: `Missing required fields: ${!question ? 'question' : ''}${!endTime ? ' endTime ' : ''}${!description ? ' description' : ''}`,
      });
    }

    // Validate resolver — required, must be a valid Ethereum address
    if (
      !resolver ||
      typeof resolver !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(resolver)
    ) {
      return res.status(400).json({
        message:
          'resolver is required and must be a valid Ethereum address (0x-prefixed, 40 hex chars)',
      });
    }

    let resolvedCategoryId: number | null = null;
    if (typeof categoryId === 'number') {
      resolvedCategoryId = categoryId;
    } else if (categorySlug) {
      const category = await prisma.category.findFirst({
        where: { slug: categorySlug },
      });
      if (!category) {
        return res
          .status(404)
          .json({ message: `Category with slug ${categorySlug} not found` });
      }
      resolvedCategoryId = category.id;
    }

    const normalizedNegRiskMarketId = normalizeNegRiskMarketId(negRiskMarketId);
    if (negRisk === true && !normalizedNegRiskMarketId) {
      return res
        .status(400)
        .json({ message: 'negRiskMarketId is required when negRisk is true' });
    }

    // Find or create condition group if groupName is provided. Lookup
    // precedence: (source='polymarket', externalEventId) when present,
    // else fall back to name.
    let resolvedGroupId: number | null = null;
    let resolvedGroup: {
      id: number;
      negRiskMarketId: string | null;
    } | null = null;
    if (groupName && groupName.trim()) {
      const group = await resolveOrCreateGroup({
        name: groupName.trim(),
        externalEventId,
        negRiskMarketId: normalizedNegRiskMarketId,
        categoryId: resolvedCategoryId,
      });
      resolvedGroup = group;
      resolvedGroupId = group.id;
    }

    const endTimeInt = parseInt(String(endTime), 10);
    if (Number.isNaN(endTimeInt)) {
      return res.status(400).json({ message: 'Invalid endTime' });
    }

    // Enforce endTime is in the future (Unix seconds)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (endTimeInt <= nowSeconds) {
      return res.status(400).json({
        message: `endTime must be a future Unix timestamp (seconds), endTime: ${endTimeInt}, nowSeconds: ${nowSeconds}`,
      });
    }

    // Validate similarMarkets URLs if provided
    if (
      typeof similarMarkets !== 'undefined' &&
      (!Array.isArray(similarMarkets) ||
        !similarMarkets.every((s) => typeof s === 'string' && isHttpUrl(s)))
    ) {
      return res
        .status(400)
        .json({ message: 'similarMarkets must be HTTP(S) URLs' });
    }

    // Validate tags if provided
    if (
      typeof tags !== 'undefined' &&
      (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))
    ) {
      return res
        .status(400)
        .json({ message: 'tags must be an array of strings' });
    }

    if (
      resolvedGroup &&
      !basketsAgree(resolvedGroup.negRiskMarketId, normalizedNegRiskMarketId)
    ) {
      return res.status(400).json({
        ...negRiskMismatchPayload(
          `Cannot add non-matching condition to negRisk group ${resolvedGroup.id}. ` +
            `Expected negRiskMarketId ${resolvedGroup.negRiskMarketId ?? 'null'}`,
          [
            {
              type: 'EXISTING_GROUP_MISMATCH',
              groupName: groupName?.trim() ?? String(resolvedGroup.id),
              expectedNegRiskMarketId: resolvedGroup.negRiskMarketId,
              mismatched: [
                {
                  conditionHash,
                  actualNegRiskMarketId: normalizedNegRiskMarketId,
                },
              ],
            },
          ]
        ),
      });
    }

    const id = conditionHash;

    try {
      const condition = await prisma.condition.create({
        data: {
          id,
          question,
          shortName:
            shortName && shortName.trim().length > 0
              ? shortName.trim()
              : undefined,
          optionName:
            optionName && optionName.trim().length > 0
              ? optionName.trim()
              : undefined,
          categoryId: resolvedCategoryId ?? undefined,
          endTime: endTimeInt,
          public: Boolean(isPublic),
          description,
          similarMarkets: Array.isArray(similarMarkets) ? similarMarkets : [],
          tags: normalizeTags(tags),
          chainId: chainId ?? 42161, // Default to Arbitrum if not provided
          estimatedPrice:
            typeof estimatedPrice === 'number' &&
            estimatedPrice >= 0 &&
            estimatedPrice <= 1
              ? estimatedPrice
              : undefined,
          similarMarketVolume:
            typeof similarMarketVolume === 'number' && similarMarketVolume >= 0
              ? similarMarketVolume
              : undefined,
          similarMarketImage:
            typeof similarMarketImage === 'string' &&
            isHttpUrl(similarMarketImage)
              ? similarMarketImage
              : undefined,
          conditionGroupId: resolvedGroupId ?? undefined,
          displayOrder: resolvedGroupId ? 0 : undefined,
          resolver: resolver.toLowerCase(),
        },
        include: { category: true, conditionGroup: true },
      });
      return res
        .status(201)
        .json(
          JSON.parse(
            JSON.stringify(condition, (_k, v) =>
              typeof v === 'bigint' ? Number(v) : v
            )
          )
        );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes('Unique constraint failed') ||
        message.includes('Unique constraint')
      ) {
        return res.status(409).json({
          message: 'Condition already exists',
        });
      }
      log.error({ err: e }, 'Error creating condition:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in create condition:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/prices - batch update estimatedPrice on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching "prices" as an :id param
router.put('/prices', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<{
        id: string;
        estimatedPrice: number;
        similarMarketVolume?: number;
        similarMarketImage?: string;
      }>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'updates must be a non-empty array' });
    }

    if (updates.length > 200) {
      return res
        .status(400)
        .json({ message: 'Batch size limit is 200 updates' });
    }

    // Validate each update
    for (const update of updates) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(update.id)) {
        return res
          .status(400)
          .json({ message: `Invalid id format: ${update.id}` });
      }
      if (
        typeof update.estimatedPrice !== 'number' ||
        update.estimatedPrice < 0 ||
        update.estimatedPrice > 1
      ) {
        return res.status(400).json({
          message: `estimatedPrice must be a number between 0 and 1 for id ${update.id}`,
        });
      }
    }

    // Use transaction with individual updates (each condition gets a different price)
    const results = await prisma.$transaction(
      updates.map((u) =>
        prisma.condition.updateMany({
          where: { id: u.id },
          data: {
            estimatedPrice: u.estimatedPrice,
            ...(typeof u.similarMarketVolume === 'number' &&
            u.similarMarketVolume >= 0
              ? { similarMarketVolume: u.similarMarketVolume }
              : {}),
            ...(typeof u.similarMarketImage === 'string' &&
            isHttpUrl(u.similarMarketImage)
              ? { similarMarketImage: u.similarMarketImage }
              : {}),
          },
        })
      )
    );

    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({
      updated: totalUpdated,
      requested: updates.length,
    });
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in batch price update:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Similar-market volume field names for validation and update building.
// These are Polymarket-derived volumes computed by the keeper.
const SIMILAR_MARKET_VOLUME_FIELDS = [
  'similarMarketVolume1h',
  'similarMarketVolume4h',
  'similarMarketVolume24h',
  'similarMarketVolume7d',
  'similarMarketVolumeFiltered1h',
  'similarMarketVolumeFiltered4h',
  'similarMarketVolumeFiltered24h',
  'similarMarketVolumeFiltered7d',
] as const;

// PUT /admin/conditions/volume - batch update time-bucketed volume on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching "volume" as an :id param
router.put('/volume', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<Record<string, unknown>>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'updates must be a non-empty array' });
    }

    if (updates.length > 200) {
      return res
        .status(400)
        .json({ message: 'Batch size limit is 200 updates' });
    }

    // Validate each update
    for (const update of updates) {
      if (
        typeof update.id !== 'string' ||
        !/^0x[0-9a-fA-F]{64}$/.test(update.id)
      ) {
        return res
          .status(400)
          .json({ message: `Invalid id format: ${update.id}` });
      }

      // Validate volume fields are non-negative numbers when present
      for (const field of SIMILAR_MARKET_VOLUME_FIELDS) {
        if (field in update) {
          if (typeof update[field] !== 'number' || update[field] < 0) {
            return res.status(400).json({
              message: `${field} must be a non-negative number for id ${update.id}`,
            });
          }
        }
      }
    }

    const results = await prisma.$transaction(
      updates.map((u) => {
        const data: Record<string, number> = {};
        for (const field of SIMILAR_MARKET_VOLUME_FIELDS) {
          if (typeof u[field] === 'number' && u[field] >= 0) {
            data[field] = u[field];
          }
        }
        return prisma.condition.updateMany({
          where: { id: u.id as string },
          data,
        });
      })
    );

    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({
      updated: totalUpdated,
      requested: updates.length,
    });
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in batch volume update:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/batch-metadata - batch update metadata fields on multiple conditions
// Each condition gets different field values. Only touches syncable metadata fields.
// NOTE: Must be registered before /:id to avoid Express matching as an :id param
router.put('/batch-metadata', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<{
        id: string;
        fields: {
          question?: string;
          shortName?: string;
          optionName?: string;
          description?: string;
          similarMarkets?: string[];
          tags?: string[];
          similarMarketVolume?: number;
          similarMarketImage?: string;
          groupName?: string;
          /** When present, takes precedence over groupName for group lookup. */
          externalEventId?: string | null;
          negRisk?: boolean;
          negRiskMarketId?: string | null;
          endTime?: number;
        };
      }>;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'updates must be a non-empty array' });
    }

    // Validate IDs and that any negRisk-claiming update carries a basket id.
    // The id itself isn't persisted on the condition — it only feeds basket
    // invariant checks at the group boundary.
    for (const u of updates) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(u.id)) {
        return res.status(400).json({ message: `Invalid id format: ${u.id}` });
      }
      if (
        u.fields.negRisk === true &&
        !normalizeNegRiskMarketId(u.fields.negRiskMarketId)
      ) {
        return res.status(400).json({
          message: `negRiskMarketId is required for negRisk condition ${u.id}`,
        });
      }
    }

    // Pre-fetch existing rows ONLY when at least one update touches endTime.
    // Mirrors the per-condition PUT /admin/conditions/:id guard at
    // L832-L836: settled rows reject endTime changes; their other fields
    // are still updatable. Skipping the query when no endTime is in scope
    // keeps the common metadata-only flow on one round-trip per row.
    const touchesEndTime = updates.some(
      (u) => typeof u.fields.endTime === 'number'
    );
    const existingById = touchesEndTime
      ? new Map(
          (
            await prisma.condition.findMany({
              where: { id: { in: [...new Set(updates.map((u) => u.id))] } },
              select: { id: true, endTime: true, settled: true },
            })
          ).map((r) => [r.id, r])
        )
      : new Map<string, { id: string; endTime: number; settled: boolean }>();

    // Resolve referenced groups using the same precedence as batch-create:
    //   - if externalEventId is present → (source, externalEventId) keyed
    //   - else → name-keyed (legacy fallback)
    type UpdateRow = (typeof updates)[number];
    const updateIdentityKey = (u: UpdateRow): string | undefined => {
      const eid = u.fields.externalEventId?.trim();
      if (eid) return `event:${eid}`;
      const n = u.fields.groupName?.trim();
      if (n) return `name:${n}`;
      return undefined;
    };
    const updatesByIdentity = new Map<string, UpdateRow[]>();
    const identityPayloads = new Map<
      string,
      { groupName?: string; externalEventId?: string | null }
    >();
    for (const u of updates) {
      const key = updateIdentityKey(u);
      if (!key) continue;
      let bucket = updatesByIdentity.get(key);
      if (!bucket) {
        bucket = [];
        updatesByIdentity.set(key, bucket);
        identityPayloads.set(key, {
          groupName: u.fields.groupName?.trim(),
          externalEventId: u.fields.externalEventId,
        });
      }
      bucket.push(u);
    }

    const maps = await resolveGroupsForBatch(
      [...identityPayloads.values()],
      'polymarket'
    );
    const groupByIdentity = new Map<
      string,
      { id: number; negRiskMarketId: string | null }
    >();
    const existingGroupByIdentity = new Map<
      string,
      { id: number; negRiskMarketId: string | null }
    >();
    for (const [identityKey] of updatesByIdentity) {
      const payload = identityPayloads.get(identityKey)!;
      const found = pickGroupForPayload(payload, maps, 'polymarket');
      if (found) {
        const summary = {
          id: found.id,
          negRiskMarketId: found.negRiskMarketId,
        };
        groupByIdentity.set(identityKey, summary);
        existingGroupByIdentity.set(identityKey, summary);
      }
    }

    // Validate basket invariants against any *already-persisted* groups
    // before creating new ones, otherwise a mid-batch reject would orphan
    // empty rows.
    for (const u of updates) {
      const key = updateIdentityKey(u);
      if (!key) continue;
      const group = existingGroupByIdentity.get(key);
      if (!group) continue;
      const payloadBasket = normalizeNegRiskMarketId(u.fields.negRiskMarketId);
      if (!basketsAgree(group.negRiskMarketId, payloadBasket)) {
        const displayName =
          identityPayloads.get(key)?.groupName ?? `group ${group.id}`;
        return res.status(400).json({
          ...negRiskMismatchPayload(
            `Cannot add non-matching condition ${u.id} to negRisk group ${group.id}. ` +
              `Expected negRiskMarketId ${group.negRiskMarketId ?? 'null'}`,
            [
              {
                type: 'EXISTING_GROUP_MISMATCH',
                groupName: displayName,
                expectedNegRiskMarketId: group.negRiskMarketId,
                mismatched: [
                  {
                    conditionHash: u.id,
                    actualNegRiskMarketId: payloadBasket,
                  },
                ],
              },
            ]
          ),
        });
      }
    }

    for (const [identityKey, incomingForGroup] of updatesByIdentity) {
      if (groupByIdentity.has(identityKey)) continue;
      const payload = identityPayloads.get(identityKey)!;
      const nameForCreate =
        payload.groupName?.trim() ||
        (payload.externalEventId
          ? `polymarket-event-${payload.externalEventId}`
          : null);
      if (!nameForCreate) continue; // unreachable — guarded by identity key
      // Leader-takes-all: first update stamps the new group's basket id,
      // every other update for that group has to match.
      const leaderBasket = normalizeNegRiskMarketId(
        incomingForGroup[0]?.fields.negRiskMarketId
      );
      const mismatched = incomingForGroup
        .slice(1)
        .filter(
          (u) =>
            !basketsAgree(
              leaderBasket,
              normalizeNegRiskMarketId(u.fields.negRiskMarketId)
            )
        );
      if (mismatched.length > 0) {
        return res.status(400).json({
          ...negRiskMismatchPayload(
            `Cannot add non-matching condition${mismatched.length > 1 ? 's' : ''} to negRisk group ${nameForCreate}. ` +
              `Expected negRiskMarketId ${leaderBasket ?? 'null'}; ` +
              `mismatched: ${mismatched.map((u) => u.id).join(', ')}`,
            [
              {
                type: 'NEW_GROUP_INCOHERENT',
                groupName: nameForCreate,
                expectedNegRiskMarketId: leaderBasket,
                mismatched: mismatched.map((u) => ({
                  conditionHash: u.id,
                  actualNegRiskMarketId: normalizeNegRiskMarketId(
                    u.fields.negRiskMarketId
                  ),
                })),
              },
            ]
          ),
        });
      }
      try {
        const group = await resolveOrCreateGroup({
          name: nameForCreate,
          externalEventId: payload.externalEventId,
          negRiskMarketId: leaderBasket,
        });
        // Race-handled within resolveOrCreateGroup. If we got back an
        // existing group via the (source, externalEventId) race fallback,
        // re-validate the invariant against the actual stored basket.
        const raceMismatched = incomingForGroup.filter(
          (u) =>
            !basketsAgree(
              group.negRiskMarketId,
              normalizeNegRiskMarketId(u.fields.negRiskMarketId)
            )
        );
        if (raceMismatched.length > 0) {
          return res.status(400).json({
            ...negRiskMismatchPayload(
              `Cannot add non-matching condition${raceMismatched.length > 1 ? 's' : ''} to negRisk group ${nameForCreate}. ` +
                `Expected negRiskMarketId ${group.negRiskMarketId ?? 'null'}; ` +
                `mismatched: ${raceMismatched.map((u) => u.id).join(', ')}`,
              [
                {
                  type: 'EXISTING_GROUP_MISMATCH',
                  groupName: nameForCreate,
                  expectedNegRiskMarketId: group.negRiskMarketId,
                  mismatched: raceMismatched.map((u) => ({
                    conditionHash: u.id,
                    actualNegRiskMarketId: normalizeNegRiskMarketId(
                      u.fields.negRiskMarketId
                    ),
                  })),
                },
              ]
            ),
          });
        }
        groupByIdentity.set(identityKey, {
          id: group.id,
          negRiskMarketId: group.negRiskMarketId,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(
          `[BatchMetadata] Failed to resolve group "${nameForCreate}": ${msg}`
        );
      }
    }

    let updated = 0;
    let failed = 0;
    let endTimeSkippedSettled = 0;

    for (const u of updates) {
      const f = u.fields;
      const data: Record<string, unknown> = {};

      if (typeof f.question === 'string') data.question = f.question;
      if (typeof f.shortName === 'string')
        data.shortName = f.shortName.trim() || null;
      if (typeof f.optionName === 'string')
        data.optionName = f.optionName.trim() || null;
      if (typeof f.description === 'string') data.description = f.description;
      if (Array.isArray(f.similarMarkets))
        data.similarMarkets = f.similarMarkets;
      if (Array.isArray(f.tags)) data.tags = normalizeTags(f.tags);
      if (
        typeof f.similarMarketVolume === 'number' &&
        f.similarMarketVolume >= 0
      )
        data.similarMarketVolume = f.similarMarketVolume;
      if (
        typeof f.similarMarketImage === 'string' &&
        isHttpUrl(f.similarMarketImage)
      )
        data.similarMarketImage = f.similarMarketImage;
      {
        const key = updateIdentityKey(u);
        if (key) {
          const group = groupByIdentity.get(key);
          if (group) {
            data.conditionGroupId = group.id;
            data.displayOrder = 0;
          }
        }
      }
      if (
        typeof f.endTime === 'number' &&
        Number.isInteger(f.endTime) &&
        f.endTime > 0
      ) {
        const existing = existingById.get(u.id);
        // Skip silently when the row is unknown (the per-row prisma.update
        // below will then fail). When the row is settled, refuse the
        // change to mirror PUT /admin/conditions/:id at L832-L836.
        if (existing && existing.settled && existing.endTime !== f.endTime) {
          endTimeSkippedSettled++;
        } else if (!existing || existing.endTime !== f.endTime) {
          data.endTime = f.endTime;
        }
      }

      if (Object.keys(data).length === 0) continue;

      try {
        await prisma.condition.update({ where: { id: u.id }, data });
        updated++;
      } catch {
        failed++;
      }
    }

    return res.status(200).json({
      updated,
      failed,
      requested: updates.length,
      endTimeSkippedSettled,
    });
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in batch metadata update:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/batch-private - batch update visibility on multiple conditions
// NOTE: Must be registered before /:id to avoid Express matching as an :id param
router.put('/batch-private', async (req: Request, res: Response) => {
  try {
    const { ids, update } = req.body as {
      ids?: string[];
      update?: { public?: boolean };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: 'ids must be a non-empty array of condition IDs' });
    }

    if (ids.length > 200) {
      return res
        .status(400)
        .json({ message: 'Batch size limit is 200 conditions' });
    }

    if (!update || typeof update !== 'object') {
      return res.status(400).json({ message: 'update object is required' });
    }

    // Validate all IDs are valid hex
    for (const id of ids) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
        return res.status(400).json({ message: `Invalid id format: ${id}` });
      }
    }

    // Build update data
    const data: Record<string, unknown> = {};

    if (typeof update.public !== 'undefined') {
      data.public = Boolean(update.public);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const existing = await prisma.condition.count({
      where: { id: { in: ids } },
    });

    if (existing === 0) {
      return res
        .status(404)
        .json({ message: 'No conditions found matching the provided IDs' });
    }

    const result = await prisma.condition.updateMany({
      where: { id: { in: ids } },
      data,
    });

    const status = existing < ids.length ? 207 : 200;
    return res.status(status).json({
      updated: result.count,
      requested: ids.length,
      found: existing,
    });
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in batch update conditions:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// PUT /admin/conditions/:id - update editable fields
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate 0x-prefixed 32-byte hex string
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      return res.status(400).json({ message: 'Invalid id format' });
    }

    const {
      question,
      shortName,
      optionName,
      categoryId,
      categorySlug,
      public: isPublic,
      description,
      similarMarkets,
      endTime,
      chainId,
      groupName,
      externalEventId,
      tags,
      estimatedPrice,
      similarMarketVolume,
      similarMarketImage,
      negRisk,
      negRiskMarketId,
    } = req.body as {
      question?: string;
      shortName?: string;
      optionName?: string;
      categoryId?: number;
      categorySlug?: string;
      public?: boolean;
      description?: string;
      similarMarkets?: string[];
      endTime?: number | string;
      chainId?: number;
      groupName?: string;
      externalEventId?: string | null;
      tags?: string[];
      estimatedPrice?: number;
      similarMarketVolume?: number;
      similarMarketImage?: string;
      negRisk?: boolean;
      negRiskMarketId?: string | null;
    };

    const existing = await prisma.condition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Condition not found' });
    }

    let newEndTime: number | undefined;
    if (typeof endTime !== 'undefined') {
      const endTimeInt = parseInt(String(endTime), 10);
      if (Number.isNaN(endTimeInt)) {
        return res.status(400).json({ message: 'Invalid endTime' });
      }
      if (endTimeInt !== existing.endTime) {
        if (existing.settled) {
          return res.status(400).json({
            message: 'endTime cannot be changed on a settled condition',
          });
        }
        newEndTime = endTimeInt;
      }
    }

    if (typeof chainId !== 'undefined' && chainId !== existing.chainId) {
      return res.status(400).json({ message: 'chainId cannot be changed' });
    }

    let resolvedCategoryId: number | null = null;
    if (typeof categoryId === 'number') {
      resolvedCategoryId = categoryId;
    } else if (categorySlug) {
      const category = await prisma.category.findFirst({
        where: { slug: categorySlug },
      });
      if (!category) {
        return res
          .status(404)
          .json({ message: `Category with slug ${categorySlug} not found` });
      }
      resolvedCategoryId = category.id;
    }

    const normalizedNegRiskMarketId = normalizeNegRiskMarketId(negRiskMarketId);
    if (negRisk === true && !normalizedNegRiskMarketId) {
      return res
        .status(400)
        .json({ message: 'negRiskMarketId is required when negRisk is true' });
    }

    // Find or create condition group if groupName is provided. Lookup
    // precedence: (source='polymarket', externalEventId) when present,
    // else fall back to name. We only need the group row for new
    // assignments — the basket invariant guards admission, not continuing
    // membership, so conditions already linked to a group don't need a
    // re-load on routine metadata edits.
    let resolvedGroupId: number | undefined;
    let targetGroup: {
      id: number;
      negRiskMarketId: string | null;
    } | null = null;
    if (groupName && groupName.trim()) {
      const categoryForGroup = resolvedCategoryId ?? existing.categoryId;
      const group = await resolveOrCreateGroup({
        name: groupName.trim(),
        externalEventId,
        negRiskMarketId: normalizedNegRiskMarketId,
        categoryId: categoryForGroup,
      });
      targetGroup = group;
      resolvedGroupId = group.id;
    }

    try {
      // Validate similarMarkets URLs if provided
      if (
        typeof similarMarkets !== 'undefined' &&
        (!Array.isArray(similarMarkets) ||
          !similarMarkets.every((s) => typeof s === 'string' && isHttpUrl(s)))
      ) {
        return res
          .status(400)
          .json({ message: 'similarMarkets must be HTTP(S) URLs' });
      }

      // Validate tags if provided
      if (
        typeof tags !== 'undefined' &&
        (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))
      ) {
        return res
          .status(400)
          .json({ message: 'tags must be an array of strings' });
      }

      if (
        targetGroup &&
        !basketsAgree(targetGroup.negRiskMarketId, normalizedNegRiskMarketId)
      ) {
        return res.status(400).json({
          ...negRiskMismatchPayload(
            `Cannot add non-matching condition to negRisk group ${targetGroup.id}. ` +
              `Expected negRiskMarketId ${targetGroup.negRiskMarketId ?? 'null'}`,
            [
              {
                type: 'EXISTING_GROUP_MISMATCH',
                groupName: groupName?.trim() ?? String(targetGroup.id),
                expectedNegRiskMarketId: targetGroup.negRiskMarketId,
                mismatched: [
                  {
                    conditionHash: id,
                    actualNegRiskMarketId: normalizedNegRiskMarketId,
                  },
                ],
              },
            ]
          ),
        });
      }

      const condition = await prisma.condition.update({
        where: { id },
        data: {
          ...(typeof question !== 'undefined' ? { question } : {}),
          ...(typeof shortName !== 'undefined'
            ? {
                shortName:
                  shortName && shortName.trim().length > 0
                    ? shortName.trim()
                    : null,
              }
            : {}),
          ...(typeof optionName !== 'undefined'
            ? {
                optionName:
                  optionName && optionName.trim().length > 0
                    ? optionName.trim()
                    : null,
              }
            : {}),
          ...(resolvedCategoryId !== null
            ? { categoryId: resolvedCategoryId }
            : {}),
          ...(typeof isPublic !== 'undefined'
            ? { public: Boolean(isPublic) }
            : {}),
          ...(typeof description !== 'undefined' ? { description } : {}),
          ...(typeof similarMarkets !== 'undefined'
            ? {
                similarMarkets: Array.isArray(similarMarkets)
                  ? similarMarkets
                  : [],
              }
            : {}),
          ...(typeof tags !== 'undefined' ? { tags: normalizeTags(tags) } : {}),
          // Update estimatedPrice if provided and valid
          ...(typeof estimatedPrice === 'number' &&
          estimatedPrice >= 0 &&
          estimatedPrice <= 1
            ? { estimatedPrice }
            : {}),
          ...(typeof similarMarketVolume === 'number' &&
          similarMarketVolume >= 0
            ? { similarMarketVolume }
            : {}),
          ...(typeof similarMarketImage === 'string' &&
          isHttpUrl(similarMarketImage)
            ? { similarMarketImage }
            : {}),
          // Extend endTime if a new forward value was provided
          ...(newEndTime !== undefined ? { endTime: newEndTime } : {}),
          // Assign to group if groupName was provided
          ...(resolvedGroupId !== undefined
            ? { conditionGroupId: resolvedGroupId, displayOrder: 0 }
            : {}),
        },
        include: { category: true, conditionGroup: true },
      });
      return res.json(
        JSON.parse(
          JSON.stringify(condition, (_k, v) =>
            typeof v === 'bigint' ? Number(v) : v
          )
        )
      );
    } catch (e: unknown) {
      log.error({ err: e }, 'Error updating condition:');
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } catch (error: unknown) {
    log.error({ err: error }, 'Error in update condition:');
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// DELETE route removed per product decision; conditions are not deletable via API

export { router };
