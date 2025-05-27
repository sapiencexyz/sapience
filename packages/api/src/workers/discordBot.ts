import { EmbedBuilder, WebhookClient } from 'discord.js';
import { LogData } from '../interfaces';
import { EventType } from '../interfaces';
import { formatUnits } from 'viem';
import { marketGroupRepository } from '../db';
import { truncateAddress } from '../utils/utils';
import * as Chains from 'viem/chains';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const webhookClient = DISCORD_WEBHOOK_URL
  ? new WebhookClient({
      url: DISCORD_WEBHOOK_URL,
    })
  : null;

export const alertEvent = async (
  chainId: number,
  address: string,
  logData: LogData
) => {
  try {
    if (!webhookClient) {
      console.warn('Discord webhook not configured, skipping alert');
      return;
    }

    if (logData.eventName === EventType.Transfer) {
      return;
    }

    let title = '';
    switch (logData.eventName) {
      case EventType.TraderPositionCreated:
      case EventType.TraderPositionModified: {
        let questionName = 'Unknown Market';
        let collateralSymbol = 'token';
        try {
          const marketObj = await marketGroupRepository.findOne({
            where: { address: address.toLowerCase(), chainId },
            relations: ['resource'],
          });

          if (marketObj) {
            questionName = marketObj.question || 'Unknown Market';
            collateralSymbol = marketObj.collateralSymbol || 'token';
          }
        } catch (error) {
          console.error('Failed to fetch market info:', error);
        }

        const collateralAmount = logData.args.positionCollateralAmount || '0';
        const formattedCollateral = formatUnits(
          BigInt(String(collateralAmount)),
          18
        );
        const collateralDisplay = Number(formattedCollateral).toLocaleString(
          'en-US',
          {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          }
        );

        const senderAddress = truncateAddress(
          String(logData.args.sender || '')
        );
        title = `${senderAddress} traded ${collateralDisplay} ${collateralSymbol} in "${questionName}?"`;
        break;
      }

      case EventType.LiquidityPositionCreated:
      case EventType.LiquidityPositionIncreased:
      case EventType.LiquidityPositionDecreased:
      case EventType.LiquidityPositionClosed: {
        const action =
          logData.eventName === EventType.LiquidityPositionDecreased ||
          logData.eventName === EventType.LiquidityPositionClosed
            ? 'Removed'
            : 'Provided';

        let questionName = 'Unknown Market';
        let collateralSymbol = 'token';
        try {
          const marketObj = await marketGroupRepository.findOne({
            where: { address: address.toLowerCase(), chainId },
            relations: ['resource'],
          });

          if (marketObj) {
            questionName = marketObj.question || 'Unknown Market';
            collateralSymbol = marketObj.collateralSymbol || 'token';
          }
        } catch (error) {
          console.error('Failed to fetch market info:', error);
        }

        const rawCollateralAmount = logData.args.deltaCollateral || '0';
        const collateralAmount = Math.abs(
          Number(rawCollateralAmount)
        ).toString();
        const formattedCollateral = formatUnits(
          BigInt(String(collateralAmount)),
          18
        );
        const collateralDisplay = Number(formattedCollateral).toLocaleString(
          'en-US',
          {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          }
        );

        const senderAddress = truncateAddress(
          String(logData.args.sender || '')
        );
        title = `${senderAddress} ${action} ${collateralDisplay} ${collateralSymbol} in liquidity for "${questionName}?"`;
        break;
      }
      default:
        return;
    }

    // Get block explorer URL based on chain ID
    const getBlockExplorerUrl = (chainId: number, txHash: string) => {
      const chain = Object.values(Chains).find((c) => c.id === chainId);
      return chain?.blockExplorers?.default?.url
        ? `${chain.blockExplorers.default.url}/tx/${txHash}`
        : `https://etherscan.io/tx/${txHash}`;
    };

    const embed = new EmbedBuilder()
      .setColor('#2b2b2e')
      .addFields({
        name: 'Transaction',
        value: getBlockExplorerUrl(chainId, logData.transactionHash),
      })
      .setTimestamp();

    await webhookClient.send({
      content: title,
      embeds: [embed],
      username: 'Market Alerts',
    });
  } catch (error) {
    console.error('Failed to send Discord webhook alert:', error);
  }
};
