import { Router } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { validateRequestParams } from '../helpers/validateRequestParams';
import { parseContractId } from '../helpers';
import { marketRepository, positionRepository, transactionRepository } from '../db';
import { getProviderForChain } from '../utils';
import { Position } from '../models/Position';
import { In } from 'typeorm';

const router = Router();

router.get(
  '/',
  validateRequestParams(['contractId']),
  handleAsyncErrors(async (req, res) => {
    const { contractId } = req.query as { contractId: string };

    const { chainId, address } = parseContractId(contractId);

    const market = await marketRepository.findOne({
      where: { chainId: Number(chainId), address: String(address) },
    });

    if (!market) {
      res.status(404).json({ error: 'Market not found' });
      return;
    }

    const where = { epoch: { market: { id: market.id } } };

    const positions = await positionRepository.find({
      where,
      order: { positionId: 'ASC' },
    });

    const marketAddress = address;
    const client = getProviderForChain(Number(chainId));

    const calculateOpenPositionValue = async (position: Position) => {
      const collateralValue = await client.readContract({
        address: marketAddress as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'getPositionCollateralValue',
            inputs: [
              {
                name: 'positionId',
                type: 'uint256',
                internalType: 'uint256',
              },
            ],
            outputs: [
              {
                name: 'collateralValue',
                type: 'uint256',
                internalType: 'uint256',
              },
            ],
            stateMutability: 'view',
          },
        ],
        functionName: 'getPositionCollateralValue',
        args: [BigInt(position.positionId)],
      });

      return Number(collateralValue);
    };

    const calculateCollateralFlow = async (positions: Position[]) => {
      const transactions = await transactionRepository.find({
        where: {
          position: { positionId: In(positions.map((p) => p.positionId)) },
        },
        relations: ['position', 'collateralTransfer'],
      });

      let collateralFlow = 0;
      let maxCollateral = 0;
      for (const transaction of transactions) {
        if (transaction.collateralTransfer) {
          collateralFlow += Number(transaction.collateralTransfer.collateral);
          maxCollateral = Math.max(maxCollateral, collateralFlow);
        }
      }
      return { collateralFlow, maxCollateral };
    };

    interface GroupedPosition {
      owner: string;
      positions: Position[];
      totalPnL: number;
      totalCollateralFlow: number;
      ownerMaxCollateral: number;
    }

    const groupedByOwner: Record<string, GroupedPosition> = {};
    for (const position of positions) {
      if (!groupedByOwner[position.owner]) {
        groupedByOwner[position.owner] = {
          owner: position.owner,
          positions: [],
          totalPnL: 0,
          totalCollateralFlow: 0,
          ownerMaxCollateral: 0,
        };
      }

      const positionPnL = await calculateOpenPositionValue(position);
      groupedByOwner[position.owner].totalPnL += positionPnL;

      groupedByOwner[position.owner].positions.push(position);
    }

    for (const owner in groupedByOwner) {
      const { collateralFlow, maxCollateral } = await calculateCollateralFlow(
        groupedByOwner[owner].positions
      );
      groupedByOwner[owner].totalPnL -= collateralFlow;
      groupedByOwner[owner].totalCollateralFlow = -collateralFlow;
      groupedByOwner[owner].ownerMaxCollateral = maxCollateral;
    }

    // Convert to array and sort by total PnL
    const sortedPositions = Object.values(groupedByOwner).sort(
      (a, b) => b.totalPnL - a.totalPnL
    );

    res.json(sortedPositions);
  })
);

export { router };
