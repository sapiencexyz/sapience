import { Request, Response, Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import prisma from '../db';

const router = Router();

// DELETE /marketGroups/:id
router.delete(
  '/:id',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Locate market group by numeric id
    const groupId = Number(id);
    if (!Number.isFinite(groupId)) {
      res.status(400).json({ error: 'Invalid market group id' });
      return;
    }

    const group = await prisma.marketGroup.findUnique({
      where: { id: groupId },
      include: { market: true },
    });

    if (!group) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    // Disallow deleting deployed market groups
    if (group.address) {
      res.status(400).json({ error: 'Cannot delete deployed market group' });
      return;
    }

    // Extra safety: ensure no markets are deployed
    const hasDeployedMarkets = group.market.some((m) => !!m.poolAddress);
    if (hasDeployedMarkets) {
      res
        .status(400)
        .json({ error: 'Cannot delete market group with deployed markets' });
      return;
    }

    // Delete markets first due to FK constraints, then the group
    await prisma.market.deleteMany({ where: { marketGroupId: group.id } });
    await prisma.marketGroup.delete({ where: { id: group.id } });

    res.json({ success: true });
  })
);

// PUT /marketGroups/:address
router.put(
  '/:address',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { address } = req.params;
    const {
      chainId,
      data,
    }: {
      chainId: number | string;
      data: Record<string, unknown>;
    } = req.body;

    if (!chainId || !data) {
      res.status(400).json({ error: 'Missing chainId or data' });
      return;
    }

    const group = await prisma.marketGroup.findFirst({
      where: {
        address: address.toLowerCase(),
        chainId: Number(chainId),
      },
      include: { market: true },
    });

    if (!group) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    const isDeployed = !!group.address;

    // Allowed fields based on deployment state
    const alwaysAllowed = new Set<string>([
      'question',
      'rules',
      'category', // slug
      'categorySlug', // alternative key
      'resourceId',
      'isCumulative',
    ]);

    const preDeployAllowed = new Set<string>([
      ...Array.from(alwaysAllowed),
      'baseTokenName',
      'quoteTokenName',
    ]);

    const allowed = isDeployed ? alwaysAllowed : preDeployAllowed;
    const incomingKeys = Object.keys(data || {});
    const forbidden = incomingKeys.filter((k) => !allowed.has(k));
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'Attempted to update forbidden fields',
        forbidden,
      });
      return;
    }

    // Build prisma update payload
    type MarketGroupUpdateShape = {
      question?: string;
      rules?: string | null;
      baseTokenName?: string;
      quoteTokenName?: string;
      isCumulative?: boolean;
      categoryId?: number;
      resourceId?: number | null;
    };
    const updateData: MarketGroupUpdateShape = {};

    if ('question' in data)
      updateData.question = String(
        (data as Record<string, unknown>)['question']
      );
    if ('rules' in data) {
      const v = (data as Record<string, unknown>)['rules'];
      updateData.rules = v == null ? null : String(v);
    }
    if ('baseTokenName' in data && !isDeployed)
      updateData.baseTokenName = String(
        (data as Record<string, unknown>)['baseTokenName']
      );
    if ('quoteTokenName' in data && !isDeployed)
      updateData.quoteTokenName = String(
        (data as Record<string, unknown>)['quoteTokenName']
      );

    if ('isCumulative' in data)
      updateData.isCumulative = Boolean(
        (data as Record<string, unknown>)['isCumulative']
      );

    // Category mapping by slug (accept category or categorySlug)
    const categorySlug =
      (data as Record<string, unknown>)['categorySlug'] ??
      (data as Record<string, unknown>)['category'];
    if (categorySlug !== undefined) {
      const category = await prisma.category.findFirst({
        where: { slug: String(categorySlug) },
      });
      if (!category) {
        res.status(404).json({ error: `Category '${categorySlug}' not found` });
        return;
      }
      updateData.categoryId = category.id;
    }

    // Resource validation if provided
    if ('resourceId' in data) {
      if ((data as Record<string, unknown>)['resourceId'] === null) {
        updateData.resourceId = null;
      } else {
        const resource = await prisma.resource.findFirst({
          where: {
            id:
              typeof (data as Record<string, unknown>)['resourceId'] ===
                'number' ||
              typeof (data as Record<string, unknown>)['resourceId'] ===
                'string'
                ? Number((data as Record<string, unknown>)['resourceId'])
                : NaN,
          },
        });
        if (!resource) {
          res.status(404).json({
            error: `Resource '${String(
              (data as Record<string, unknown>)['resourceId']
            )}' not found`,
          });
          return;
        }
        updateData.resourceId = resource.id;
      }
    }

    const updated = await prisma.marketGroup.update({
      where: { id: group.id },
      data: updateData,
      include: { market: true, category: true, resource: true },
    });

    res.json(updated);
  })
);

// PUT /marketGroups/:address/markets/:marketId
router.put(
  '/:address/markets/:marketId',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { address, marketId } = req.params;
    const {
      chainId,
      data,
    }: {
      chainId: number | string;
      data: Record<string, unknown>;
    } = req.body;

    if (!chainId || !data) {
      res.status(400).json({ error: 'Missing chainId or data' });
      return;
    }

    const group = await prisma.marketGroup.findFirst({
      where: { address: address.toLowerCase(), chainId: Number(chainId) },
    });

    if (!group) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    const market = await prisma.market.findFirst({
      where: { marketGroupId: group.id, marketId: Number(marketId) },
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    const isDeployed = !!market.poolAddress;

    const alwaysAllowed = new Set<string>([
      'question',
      'shortName',
      'optionName',
      'public',
    ]);

    const preDeployAllowed = new Set<string>([
      ...Array.from(alwaysAllowed),
      'claimStatementYesOrNumeric',
      'claimStatementNo',
      'startTime',
      'endTime',
      'startingSqrtPriceX96',
      'baseAssetMinPriceTick',
      'baseAssetMaxPriceTick',
    ]);

    const allowed = isDeployed ? alwaysAllowed : preDeployAllowed;
    const incomingKeys = Object.keys(data || {});
    const forbidden = incomingKeys.filter((k) => !allowed.has(k));
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'Attempted to update forbidden fields',
        forbidden,
      });
      return;
    }

    type MarketUpdateShape = {
      question?: string;
      shortName?: string | null;
      optionName?: string;
      public?: boolean;
      claimStatementYesOrNumeric?: string;
      claimStatementNo?: string | null;
      startTimestamp?: number;
      endTimestamp?: number;
      startingSqrtPriceX96?: string;
      baseAssetMinPriceTick?: number;
      baseAssetMaxPriceTick?: number;
    };
    const updateData: MarketUpdateShape = {};

    if ('question' in data)
      updateData.question = String(
        (data as Record<string, unknown>)['question']
      );
    if ('shortName' in data) {
      const v = (data as Record<string, unknown>)['shortName'];
      const s = v == null ? null : String(v).trim();
      updateData.shortName = s && s.length > 0 ? s : null;
    }
    if ('optionName' in data)
      updateData.optionName = String(
        (data as Record<string, unknown>)['optionName']
      );
    if ('public' in data)
      updateData.public = Boolean((data as Record<string, unknown>)['public']);

    if (!isDeployed) {
      if ('claimStatementYesOrNumeric' in data)
        updateData.claimStatementYesOrNumeric = String(
          (data as Record<string, unknown>)['claimStatementYesOrNumeric']
        );
      if ('claimStatementNo' in data) {
        const v = (data as Record<string, unknown>)['claimStatementNo'];
        updateData.claimStatementNo = v == null ? null : String(v);
      }
      if ('startTime' in data)
        updateData.startTimestamp = parseInt(
          String((data as Record<string, unknown>)['startTime']),
          10
        );
      if ('endTime' in data)
        updateData.endTimestamp = parseInt(
          String((data as Record<string, unknown>)['endTime']),
          10
        );
      if ('startingSqrtPriceX96' in data)
        updateData.startingSqrtPriceX96 = String(
          (data as Record<string, unknown>)['startingSqrtPriceX96']
        );
      if ('baseAssetMinPriceTick' in data)
        updateData.baseAssetMinPriceTick = parseInt(
          String((data as Record<string, unknown>)['baseAssetMinPriceTick']),
          10
        );
      if ('baseAssetMaxPriceTick' in data)
        updateData.baseAssetMaxPriceTick = parseInt(
          String((data as Record<string, unknown>)['baseAssetMaxPriceTick']),
          10
        );
    }

    const updated = await prisma.market.update({
      where: { id: market.id },
      data: updateData,
    });

    res.json(updated);
  })
);

// PUT /marketGroups/by-id/:id
router.put(
  '/by-id/:id',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      data,
    }: {
      data: Record<string, unknown>;
    } = req.body;

    const groupId = Number(id);
    if (!Number.isFinite(groupId)) {
      res.status(400).json({ error: 'Invalid market group id' });
      return;
    }

    const group = await prisma.marketGroup.findUnique({
      where: { id: groupId },
      include: { market: true },
    });

    if (!group) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    const isDeployed = !!group.address;

    const alwaysAllowed = new Set<string>([
      'question',
      'rules',
      'category', // slug
      'categorySlug', // alternative key
      'resourceId',
      'isCumulative',
    ]);

    const preDeployAllowed = new Set<string>([
      ...Array.from(alwaysAllowed),
      'baseTokenName',
      'quoteTokenName',
    ]);

    const allowed = isDeployed ? alwaysAllowed : preDeployAllowed;
    const incomingKeys = Object.keys(data || {});
    const forbidden = incomingKeys.filter((k) => !allowed.has(k));
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'Attempted to update forbidden fields',
        forbidden,
      });
      return;
    }

    type MarketGroupUpdateShape = {
      question?: string;
      rules?: string | null;
      baseTokenName?: string;
      quoteTokenName?: string;
      isCumulative?: boolean;
      categoryId?: number;
      resourceId?: number | null;
    };
    const updateData: MarketGroupUpdateShape = {};

    if ('question' in data)
      updateData.question = String(
        (data as Record<string, unknown>)['question']
      );
    if ('rules' in data) {
      const v = (data as Record<string, unknown>)['rules'];
      updateData.rules = v == null ? null : String(v);
    }
    if ('baseTokenName' in data && !isDeployed)
      updateData.baseTokenName = String(
        (data as Record<string, unknown>)['baseTokenName']
      );
    if ('quoteTokenName' in data && !isDeployed)
      updateData.quoteTokenName = String(
        (data as Record<string, unknown>)['quoteTokenName']
      );

    if ('isCumulative' in data)
      updateData.isCumulative = Boolean(
        (data as Record<string, unknown>)['isCumulative']
      );

    const categorySlug =
      (data as Record<string, unknown>)['categorySlug'] ??
      (data as Record<string, unknown>)['category'];
    if (categorySlug !== undefined) {
      const category = await prisma.category.findFirst({
        where: { slug: String(categorySlug) },
      });
      if (!category) {
        res.status(404).json({ error: `Category '${categorySlug}' not found` });
        return;
      }
      updateData.categoryId = category.id;
    }

    if ('resourceId' in data) {
      if ((data as Record<string, unknown>)['resourceId'] === null) {
        updateData.resourceId = null;
      } else {
        const resource = await prisma.resource.findFirst({
          where: {
            id:
              typeof (data as Record<string, unknown>)['resourceId'] ===
                'number' ||
              typeof (data as Record<string, unknown>)['resourceId'] ===
                'string'
                ? Number((data as Record<string, unknown>)['resourceId'])
                : NaN,
          },
        });
        if (!resource) {
          res.status(404).json({
            error: `Resource '${String(
              (data as Record<string, unknown>)['resourceId']
            )}' not found`,
          });
          return;
        }
        updateData.resourceId = resource.id;
      }
    }

    const updated = await prisma.marketGroup.update({
      where: { id: group.id },
      data: updateData,
      include: { market: true, category: true, resource: true },
    });

    res.json(updated);
  })
);

// PUT /marketGroups/by-id/:id/markets/:marketId
router.put(
  '/by-id/:id/markets/:marketId',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { id, marketId } = req.params;
    const {
      data,
    }: {
      data: Record<string, unknown>;
    } = req.body;

    const groupId = Number(id);
    const dbMarketId = Number(marketId);
    if (!Number.isFinite(groupId) || !Number.isFinite(dbMarketId)) {
      res.status(400).json({ error: 'Invalid id(s)' });
      return;
    }

    const group = await prisma.marketGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      res.status(404).json({ error: 'MarketGroup not found' });
      return;
    }

    const market = await prisma.market.findUnique({
      where: { id: dbMarketId },
    });
    if (!market || market.marketGroupId !== group.id) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    const isDeployed = !!market.poolAddress;

    const alwaysAllowed = new Set<string>([
      'question',
      'shortName',
      'optionName',
      'public',
    ]);
    const preDeployAllowed = new Set<string>([
      ...Array.from(alwaysAllowed),
      'claimStatementYesOrNumeric',
      'claimStatementNo',
      'startTime',
      'endTime',
      'startingSqrtPriceX96',
      'baseAssetMinPriceTick',
      'baseAssetMaxPriceTick',
    ]);

    const allowed = isDeployed ? alwaysAllowed : preDeployAllowed;
    const incomingKeys = Object.keys(data || {});
    const forbidden = incomingKeys.filter((k) => !allowed.has(k));
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'Attempted to update forbidden fields',
        forbidden,
      });
      return;
    }

    type MarketUpdateShape = {
      question?: string;
      shortName?: string | null;
      optionName?: string;
      public?: boolean;
      claimStatementYesOrNumeric?: string;
      claimStatementNo?: string | null;
      startTimestamp?: number;
      endTimestamp?: number;
      startingSqrtPriceX96?: string;
      baseAssetMinPriceTick?: number;
      baseAssetMaxPriceTick?: number;
    };
    const updateData: MarketUpdateShape = {};

    if ('question' in data)
      updateData.question = String(
        (data as Record<string, unknown>)['question']
      );
    if ('shortName' in data) {
      const v = (data as Record<string, unknown>)['shortName'];
      const s = v == null ? null : String(v).trim();
      updateData.shortName = s && s.length > 0 ? s : null;
    }
    if ('optionName' in data)
      updateData.optionName = String(
        (data as Record<string, unknown>)['optionName']
      );
    if ('public' in data)
      updateData.public = Boolean((data as Record<string, unknown>)['public']);

    if (!isDeployed) {
      if ('claimStatementYesOrNumeric' in data)
        updateData.claimStatementYesOrNumeric = String(
          (data as Record<string, unknown>)['claimStatementYesOrNumeric']
        );
      if ('claimStatementNo' in data) {
        const v = (data as Record<string, unknown>)['claimStatementNo'];
        updateData.claimStatementNo = v == null ? null : String(v);
      }
      if ('startTime' in data)
        updateData.startTimestamp = parseInt(
          String((data as Record<string, unknown>)['startTime']),
          10
        );
      if ('endTime' in data)
        updateData.endTimestamp = parseInt(
          String((data as Record<string, unknown>)['endTime']),
          10
        );
      if ('startingSqrtPriceX96' in data)
        updateData.startingSqrtPriceX96 = String(
          (data as Record<string, unknown>)['startingSqrtPriceX96']
        );
      if ('baseAssetMinPriceTick' in data)
        updateData.baseAssetMinPriceTick = parseInt(
          String((data as Record<string, unknown>)['baseAssetMinPriceTick']),
          10
        );
      if ('baseAssetMaxPriceTick' in data)
        updateData.baseAssetMaxPriceTick = parseInt(
          String((data as Record<string, unknown>)['baseAssetMaxPriceTick']),
          10
        );
    }

    const updated = await prisma.market.update({
      where: { id: market.id },
      data: updateData,
    });

    res.json(updated);
  })
);

export { router };
