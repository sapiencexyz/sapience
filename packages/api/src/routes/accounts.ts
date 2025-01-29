import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { formatDbBigInt } from '../utils';
import { hydrateTransactions } from '../helpers/hydrateTransactions';
import { positionRepository, transactionRepository } from '../db';

const router = Router();

router.get(
  '/:address',
  handleAsyncErrors(async (req, res) => {
    const { address } = req.params;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: 'Invalid address format' });
      return;
    }

    const positions = await positionRepository.find({
      where: { owner: address },
      relations: [
        'epoch',
        'epoch.market',
        'epoch.market.resource',
        'transactions',
      ],
    });

    const transactions = await transactionRepository.find({
      where: { position: { owner: address } },
      relations: [
        'position',
        'position.epoch',
        'position.epoch.market',
        'position.epoch.market.resource',
        'event',
      ],
    });

    positions.forEach((position) => {
      position.baseToken = formatDbBigInt(position.baseToken);
      position.quoteToken = formatDbBigInt(position.quoteToken);
      position.borrowedBaseToken = formatDbBigInt(position.borrowedBaseToken);
      position.borrowedQuoteToken = formatDbBigInt(
        position.borrowedQuoteToken
      );
      position.collateral = formatDbBigInt(position.collateral);
      position.lpBaseToken = formatDbBigInt(position.lpBaseToken);
      position.lpQuoteToken = formatDbBigInt(position.lpQuoteToken);

      position.transactions = hydrateTransactions(position.transactions);
    });

    const hydratedPositions = hydrateTransactions(transactions);

    res.json({ positions, transactions: hydratedPositions });
  })
);

export { router } ;
