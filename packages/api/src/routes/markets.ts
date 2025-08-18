import { Request, Response, Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import prisma from '../db';
import { isValidWalletSignature } from '../middleware';

const router = Router();

router.get(
  '/',
  handleAsyncErrors(async (_, res: Response) => {
    const markets = await prisma.marketGroup.findMany({
      include: {
        market: true,
        resource: true,
        category: true,
      },
    });

    const formattedMarkets = markets.map((marketGroup) => ({
      ...marketGroup,
      markets: marketGroup.market.map((market) => ({
        ...market,
        startTimestamp: Number(market.startTimestamp),
        endTimestamp: Number(market.endTimestamp),
        question: market.question,
      })),
    }));

    res.json(formattedMarkets);
  })
);

export { router };

// Add authenticated update endpoints for market groups and markets

// PUT /marketGroups/:address
router.put(
  '/:address',
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { address } = req.params;
    const {
      chainId,
      data,
      signature,
      timestamp,
    }: {
      chainId: number | string;
      data: Record<string, unknown>;
      signature?: `0x${string}`;
      timestamp?: number;
    } = req.body;

    if (!chainId || !data) {
      res.status(400).json({ error: 'Missing chainId or data' });
      return;
    }

    const isAuthenticated = await isValidWalletSignature(
      signature as `0x${string}`,
      Number(timestamp)
    );
    if (!isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
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
    const alwaysAllowed = new Set<keyof typeof data>([
      'question',
      'category', // slug
      'categorySlug', // alternative key
      'resourceId',
      'isCumulative',
    ] as unknown as (keyof typeof data)[]);

    const preDeployAllowed = new Set<keyof typeof data>([
      ...Array.from(alwaysAllowed),
      'baseTokenName',
      'quoteTokenName',
    ] as unknown as (keyof typeof data)[]);

    const allowed = isDeployed ? alwaysAllowed : preDeployAllowed;
    const incomingKeys = Object.keys(data || {});
    const forbidden = incomingKeys.filter((k) => !allowed.has(k as any));
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'Attempted to update forbidden fields',
        forbidden,
      });
      return;
    }

    // Build prisma update payload
    const updateData: Record<string, any> = {};

    if ('question' in data) updateData.question = data.question;
    if ('baseTokenName' in data && !isDeployed)
      updateData.baseTokenName = data.baseTokenName;
    if ('quoteTokenName' in data && !isDeployed)
      updateData.quoteTokenName = data.quoteTokenName;

    if ('isCumulative' in data)
      updateData.isCumulative = Boolean(data.isCumulative);

    // Category mapping by slug (accept category or categorySlug)
    const categorySlug = (data as any).categorySlug || (data as any).category;
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
      if (data.resourceId === null) {
        updateData.resourceId = null;
      } else {
        const resource = await prisma.resource.findFirst({
          where: { id: Number((data as any).resourceId) },
        });
        if (!resource) {
          res
            .status(404)
            .json({ error: `Resource '${(data as any).resourceId}' not found` });
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
      signature,
      timestamp,
    }: {
      chainId: number | string;
      data: Record<string, unknown>;
      signature?: `0x${string}`;
      timestamp?: number;
    } = req.body;

    if (!chainId || !data) {
      res.status(400).json({ error: 'Missing chainId or data' });
      return;
    }

    const isAuthenticated = await isValidWalletSignature(
      signature as `0x${string}`,
      Number(timestamp)
    );
    if (!isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
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

    const alwaysAllowed = new Set<keyof typeof data>([
      'question',
      'optionName',
      'rules',
      'public',
    ] as unknown as (keyof typeof data)[]);

    const preDeployAllowed = new Set<keyof typeof data>([
      ...Array.from(alwaysAllowed),
      'claimStatementYesOrNumeric',
      'claimStatementNo',
      'startTime',
      'endTime',
      'startingSqrtPriceX96',
      'baseAssetMinPriceTick',
      'baseAssetMaxPriceTick',
    ] as unknown as (keyof typeof data)[]);

    const allowed = isDeployed ? alwaysAllowed : preDeployAllowed;
    const incomingKeys = Object.keys(data || {});
    const forbidden = incomingKeys.filter((k) => !allowed.has(k as any));
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'Attempted to update forbidden fields',
        forbidden,
      });
      return;
    }

    const updateData: Record<string, any> = {};

    if ('question' in data) updateData.question = data.question;
    if ('optionName' in data) updateData.optionName = data.optionName;
    if ('rules' in data) updateData.rules = data.rules ?? null;
    if ('public' in data) updateData.public = Boolean((data as any).public);

    if (!isDeployed) {
      if ('claimStatementYesOrNumeric' in data)
        updateData.claimStatementYesOrNumeric =
          (data as any).claimStatementYesOrNumeric;
      if ('claimStatementNo' in data)
        updateData.claimStatementNo = (data as any).claimStatementNo ?? null;
      if ('startTime' in data)
        updateData.startTimestamp = parseInt(String((data as any).startTime), 10);
      if ('endTime' in data)
        updateData.endTimestamp = parseInt(String((data as any).endTime), 10);
      if ('startingSqrtPriceX96' in data)
        updateData.startingSqrtPriceX96 = String(
          (data as any).startingSqrtPriceX96
        );
      if ('baseAssetMinPriceTick' in data)
        updateData.baseAssetMinPriceTick = parseInt(
          String((data as any).baseAssetMinPriceTick),
          10
        );
      if ('baseAssetMaxPriceTick' in data)
        updateData.baseAssetMaxPriceTick = parseInt(
          String((data as any).baseAssetMaxPriceTick),
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
