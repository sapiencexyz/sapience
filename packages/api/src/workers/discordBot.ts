import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { LogData } from '../interfaces';
import { EventType } from '../interfaces';
import { formatUnits } from 'viem';
import { marketGroupRepository } from '../db';
import * as Chains from 'viem/chains';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_PRIVATE_CHANNEL_ID = process.env.DISCORD_PRIVATE_CHANNEL_ID;
const DISCORD_PUBLIC_CHANNEL_ID = process.env.DISCORD_PUBLIC_CHANNEL_ID;
const discordClient = new Client({ intents: [] });

if (DISCORD_TOKEN) {
  discordClient.login(DISCORD_TOKEN).catch((error) => {
    console.error('Failed to login to Discord:', error);
  });
} else {
  console.log('discord token not found');
}

export const alertEvent = async (
  chainId: number,
  address: string,
  epochId: number,
  blockNumber: bigint,
  timestamp: bigint,
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

    if (DISCORD_PUBLIC_CHANNEL_ID && logData.eventName !== EventType.Transfer) {
      const publicChannel = (await discordClient.channels.fetch(
        DISCORD_PUBLIC_CHANNEL_ID
      )) as TextChannel;

      let title = '';

      // Format based on event type
      switch (logData.eventName) {
        case EventType.TraderPositionCreated:
        case EventType.TraderPositionModified: {
          const tradeDirection =
            BigInt(String(logData.args.finalPrice)) >
            BigInt(String(logData.args.initialPrice))
              ? 'Long'
              : 'Short';
          const gasAmount = formatUnits(
            BigInt(
              String(
                logData.args.positionVgasAmount ||
                  logData.args.positionBorrowedVgas
              )
            ),
            18
          ); // returns string
          const rawPriceGwei = Number(logData.args.tradeRatio) / 1e18;
          const priceGwei = rawPriceGwei.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          });

          title = `${tradeDirection === 'Long' ? '<:pepegas:1313887905508364288>' : '<:peepoangry:1313887206687117313>'} **Trade Executed:** ${tradeDirection} ${gasAmount} Ggas @ ${priceGwei} wstGwei`;
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
              : 'Added';
          const liquidityGas = formatUnits(
            BigInt(
              String(
                logData.args.addedAmount0 ||
                  logData.args.increasedAmount0 ||
                  logData.args.amount0
              )
            ),
            18
          ); // returns string
          let priceRangeText = '';
          if (
            logData.args.lowerTick !== undefined &&
            logData.args.upperTick !== undefined
          ) {
            const rawLowerPrice = Math.pow(
              1.0001,
              Number(logData.args.lowerTick)
            );
            const rawUpperPrice = Math.pow(
              1.0001,
              Number(logData.args.upperTick)
            );

            const lowerPrice = rawLowerPrice.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });
            const upperPrice = rawUpperPrice.toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });

            priceRangeText = ` from ${lowerPrice} - ${upperPrice} wstGwei`;
          }

          title = `<:pepeliquid:1313887190056439859> **Liquidity Modified:** ${action} ${liquidityGas} Ggas${priceRangeText}`;
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

      let marketName = 'Foil Market';
      try {
        const marketObj = await marketGroupRepository.findOne({
          where: { address: address.toLowerCase(), chainId },
          relations: ['resource'],
        });

        if (marketObj && marketObj.resource && marketObj.resource.name) {
          marketName = marketObj.resource.name;
        }
      } catch (error) {
        console.error('Failed to fetch market name from database:', error);
      }

      const embed = new EmbedBuilder()
        .setColor('#2b2b2e')
        .addFields(
          {
            name: 'Market',
            value: `${marketName} (Epoch ${epochId.toString()})`,
            inline: true,
          },
          {
            name: 'Position',
            value: String(logData.args.positionId),
            inline: true,
          },
          {
            name: 'Account',
            value: String(logData.args.sender),
          },
          {
            name: 'Transaction',
            value: getBlockExplorerUrl(chainId, logData.transactionHash),
          }
        )
        .setTimestamp();

      await publicChannel.send({ content: title, embeds: [embed] });
    }

    if (DISCORD_PRIVATE_CHANNEL_ID) {
      const privateChannel = (await discordClient.channels.fetch(
        DISCORD_PRIVATE_CHANNEL_ID
      )) as TextChannel;

      const embed = new EmbedBuilder()
        .setTitle(`New Market Event: ${logData.eventName}`)
        .setColor('#2b2b2e')
        .addFields(
          { name: 'Chain ID', value: chainId.toString(), inline: true },
          { name: 'Market Address', value: address, inline: true },
          { name: 'Epoch ID', value: epochId.toString(), inline: true },
          { name: 'Block Number', value: blockNumber.toString(), inline: true },
          {
            name: 'Timestamp',
            value: new Date(Number(timestamp) * 1000).toISOString(),
            inline: true,
          }
        )
        .setTimestamp();

      // Add event-specific details if available
      if (logData.args) {
        const argsField = Object.entries(logData.args)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        embed.addFields({
          name: 'Event Arguments',
          value: `\`\`\`${argsField}\`\`\``,
        });
      }

      await privateChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Failed to send Discord alert:', error);
  }
};
