import { EmbedBuilder, Client, TextChannel } from 'discord.js';
import { LogData } from '../interfaces';
import { EventType } from '../interfaces';
import { formatUnits } from 'viem';
import { marketGroupRepository } from '../db';
import { truncateAddress } from '../utils/utils';
import * as Chains from 'viem/chains';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_PRIVATE_CHANNEL_ID = process.env.DISCORD_PRIVATE_CHANNEL_ID;
const DISCORD_PUBLIC_CHANNEL_ID = process.env.DISCORD_PUBLIC_CHANNEL_ID;
const discordClient = new Client({ intents: [] });

if (DISCORD_TOKEN) {
  discordClient.login(DISCORD_TOKEN).catch((error) => {
    console.error('Failed to login to Discord:', error);
  });
}

export const alertEvent = async (
  chainId: number,
  address: string,
  logData: LogData
) => {
  try {
    if (!DISCORD_TOKEN) {
      console.warn('Discord credentials not configured, skipping alert');
      return;
    }

    // Add check for client readiness
    if (!discordClient.isReady()) {
      console.warn('Discord client not ready, skipping alert');
      return;
    }

    if (!DISCORD_PUBLIC_CHANNEL_ID || logData.eventName === EventType.Transfer) {
      return; // Skip if no channel configured or transfer events
    }

    const publicChannel = (await discordClient.channels.fetch(
      DISCORD_PUBLIC_CHANNEL_ID
    )) as TextChannel;

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

        const senderAddress = truncateAddress(String(logData.args.sender || ''));
        title = `${senderAddress} traded ${collateralDisplay} ${collateralSymbol} in "${questionName}"`;
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

        const senderAddress = truncateAddress(String(logData.args.sender || ''));
        title = `${senderAddress} Provided ${collateralDisplay} ${collateralSymbol} in liquidity for "${questionName}"`;
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

    await publicChannel.send({
      content: title,
      embeds: [embed]
    });

  } catch (error) {
    console.error('Error sending Discord alert:', error);
  }
};
