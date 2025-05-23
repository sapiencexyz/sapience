import { EmbedBuilder, WebhookClient } from 'discord.js';
import { LogData } from '../interfaces';
import { EventType } from '../interfaces';
import { formatUnits } from 'viem';
import { marketGroupRepository } from '../db';
import * as Chains from 'viem/chains';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const webhookClient = DISCORD_WEBHOOK_URL ? new WebhookClient({
  url: DISCORD_WEBHOOK_URL,
}) : null;

export const alertEvent = async (
  chainId: number,
  address: string,
  epochId: number,
  blockNumber: bigint,
  timestamp: bigint,
  logData: LogData
) => {
  try {
    if (!webhookClient) {
      console.warn('Discord webhook not configured, skipping alert');
      return;
    }

    if (logData.eventName === EventType.Transfer) {
      return; // Skip transfer events
    }

    let title = '';

    switch (logData.eventName) {
      case EventType.TraderPositionCreated:
      case EventType.TraderPositionModified: {
        let questionName = 'Unknown Market';
        let collateralSymbol = 'tokens';
        try {
          const marketObj = await marketGroupRepository.findOne({
            where: { address: address.toLowerCase(), chainId },
            relations: ['resource'],
          });

          if (marketObj) {
            questionName = marketObj.question || marketObj.resource?.name || 'Unknown Market';
            collateralSymbol = marketObj.quoteTokenName || marketObj.collateralSymbol || 'tokens';
          }
        } catch (error) {
          console.error('Failed to fetch market info:', error);
        }

       
        const collateralAmount = logData.args.collateralAmount || logData.args.positionCollateralAmount || '0';
        const formattedCollateral = formatUnits(BigInt(String(collateralAmount)), 18);
        const collateralDisplay = Number(formattedCollateral).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 4,
        });

        const action = logData.eventName === EventType.TraderPositionCreated ? 'created' : 'modified';
        title = `📈 **Trade position ${action}** in market'${questionName}?' with ${collateralDisplay} ${collateralSymbol} traded`;
        break;
      }

      case EventType.LiquidityPositionCreated:
      case EventType.LiquidityPositionIncreased:
      case EventType.LiquidityPositionDecreased:
      case EventType.LiquidityPositionClosed: {
        const action =
          logData.eventName === EventType.LiquidityPositionDecreased ||
          logData.eventName === EventType.LiquidityPositionClosed
            ? 'removed'
            : 'added';

        // Get question name and collateral info
        let questionName = 'Unknown Market';
        let collateralSymbol = 'tokens';
        try {
          const marketObj = await marketGroupRepository.findOne({
            where: { address: address.toLowerCase(), chainId },
            relations: ['resource'],
          });

          if (marketObj) {
            questionName = marketObj.question || marketObj.resource?.name || 'Unknown Market';
            collateralSymbol = marketObj.quoteTokenName || marketObj.collateralSymbol || 'tokens';
          }
        } catch (error) {
          console.error('Failed to fetch market info:', error);
        }

        // Format collateral amount
        const collateralAmount = logData.args.collateralAmount || logData.args.deltaCollateral || '0';
        const formattedCollateral = formatUnits(BigInt(String(collateralAmount)), 18);
        const collateralDisplay = Number(formattedCollateral).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 4,
        });

        title = `💧 **Liquidity ${action}** for '${questionName}' with ${collateralDisplay} ${collateralSymbol} collateral`;
        break;
      }
      default:
        return; // Skip other events
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
      .addFields(
        {
          name: 'Transaction',
          value: getBlockExplorerUrl(chainId, logData.transactionHash),
        }
      )
      .setTimestamp();

    await webhookClient.send({
      content: title,
      embeds: [embed],
      username: 'Foil Bot',
      avatarURL: 'https://i.imgur.com/AfFp7pu.png'
    });

  } catch (error) {
    console.error('Failed to send Discord webhook alert:', error);
  }
};
