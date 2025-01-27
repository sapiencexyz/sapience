import { Router, Request, Response } from 'express';
import { validateRequestParams } from '../helpers/validateRequestParams';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { parseContractId } from '../helpers/parseContractId';
import dataSource from '../db';
import { Transaction } from '../models/Transaction';
import { hydrateTransactions } from 'src/helpers';

const router = Router();

const transactionRepository = dataSource.getRepository(Transaction);

router.get(
  '/',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { contractId, epochId, positionId } = req.query as {
      contractId: string;
      epochId?: string;
      positionId?: string;
    };

    const { chainId, address } = parseContractId(contractId);

    const queryBuilder = transactionRepository
      .createQueryBuilder('transaction')
      .innerJoinAndSelect('transaction.position', 'position')
      .innerJoinAndSelect('position.epoch', 'epoch')
      .innerJoinAndSelect('epoch.market', 'market')
      .innerJoinAndSelect('market.resource', 'resource')
      .innerJoinAndSelect('transaction.event', 'event')
      .where('market.chainId = :chainId', { chainId })
      .andWhere('market.address = :address', { address })
      .orderBy('position.positionId', 'ASC')
      .addOrderBy('event.blockNumber', 'ASC');

    if (epochId) {
      queryBuilder.andWhere('epoch.epochId = :epochId', { epochId });
    }

    if (positionId) {
      queryBuilder.andWhere('position.positionId = :positionId', {
        positionId,
      });
    }

    const transactions = await queryBuilder.getMany();
    const hydratedPositions = hydrateTransactions(transactions);

    res.json(hydratedPositions);
  })
);

export { router };
