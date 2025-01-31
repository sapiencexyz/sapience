import { Request, Response, Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import { validateRequestParams } from '../helpers/validateRequestParams';
import dataSource from '../db';
import { Market } from '../models/Market';
import { Position } from '../models/Position';
import { formatDbBigInt } from '../utils';
const marketRepository = dataSource.getRepository(Market);
const positionRepository = dataSource.getRepository(Position);
const router = Router();

router.get(
  '/',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { isLP, contractId } = req.query as {
      isLP: string;
      contractId: string;
    };

    const { chainId, address } = parseContractId(contractId);

    const market = await marketRepository.findOne({
      where: { chainId: Number(chainId), address: String(address) },
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    // Query for positions related to any epoch of this market
    const where = {
      isLP: isLP === 'true' ? true : undefined,
      epoch: { market: { id: market.id } },
    };

    const positions = await positionRepository.find({
      where,
      relations: ['epoch', 'epoch.market', 'epoch.market.resource'],
      order: { positionId: 'ASC' },
    });

    // Format the data
    for (const position of positions) {
      position.baseToken = formatDbBigInt(position.baseToken);
      position.quoteToken = formatDbBigInt(position.quoteToken);
      position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
      position.borrowedQuoteToken = formatDbBigInt(position.borrowedQuoteToken);
      position.collateral = formatDbBigInt(position.collateral);
      position.lpBaseToken = formatDbBigInt(position.lpBaseToken);
      position.lpQuoteToken = formatDbBigInt(position.lpQuoteToken);
    }
    res.json(positions);
  })
);

router.get(
  '/:positionId',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { positionId } = req.params;
    const { contractId } = req.query as { contractId: string };

    const { chainId, address } = parseContractId(contractId);

    const market = await marketRepository.findOne({
      where: { chainId: Number(chainId), address: String(address) },
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    const position = await positionRepository.findOne({
      where: {
        positionId: Number(positionId),
        epoch: { market: { id: market.id } },
      },
      relations: ['epoch', 'epoch.market', 'epoch.market.resource'],
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    // Format the data
    position.baseToken = formatDbBigInt(position.baseToken);
    position.quoteToken = formatDbBigInt(position.quoteToken);
    position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
    position.borrowedQuoteToken = formatDbBigInt(position.borrowedQuoteToken);
    position.collateral = formatDbBigInt(position.collateral);
    position.lpBaseToken = formatDbBigInt(position.lpBaseToken);
    position.lpQuoteToken = formatDbBigInt(position.lpQuoteToken);

    res.json(position);
  })
);

export { router };
