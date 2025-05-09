import { Router } from 'express';

import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { validateRequestParams } from '../helpers/validateRequestParams';

import { WSTETH_ADDRESS_SEPOLIA, WSTETH_ADDRESS_MAINNET } from '../constants';
import {
  getBlockBeforeTimestamp,
  getChainById,
  mainnetPublicClient,
  sepoliaPublicClient,
} from '../utils/utils';

const router = Router();

router.get(
  '/',
  validateRequestParams(['chainId']),
  handleAsyncErrors(async (req, res) => {
    const { chainId, endTime } = req.query as {
      chainId: string;
      endTime?: string;
    };

    const chain = getChainById(Number(chainId));

    if (!chain) {
      throw new Error('Chain not found');
    }

    const address = chain.testnet
      ? WSTETH_ADDRESS_SEPOLIA
      : WSTETH_ADDRESS_MAINNET;

    const client = chain.testnet ? sepoliaPublicClient : mainnetPublicClient;

    const block = endTime
      ? await getBlockBeforeTimestamp(client, Number(endTime))
      : null;

    const stEthPerTokenResult = await client.readContract({
      address: address as `0x${string}`,
      abi: [
        {
          inputs: [],
          name: 'stEthPerToken',
          outputs: [
            {
              internalType: 'uint256',
              name: '',
              type: 'uint256',
            },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'stEthPerToken',
      blockNumber: block?.number ?? undefined,
    });

    res.json({
      stEthPerToken: stEthPerTokenResult.toString(),
    });
  })
);

export { router };
