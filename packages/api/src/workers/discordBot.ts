import { EmbedBuilder, WebhookClient } from 'discord.js';
import { LogData } from '../interfaces';
import { EventType } from '../interfaces';
import { formatUnits } from 'viem';
import prisma from '../db';
import {
  truncateAddress,
  formatToFirstSignificantDecimal,
} from '../utils/utils';
import * as Chains from 'viem/chains';

const DISCORD_WEBHOOK_URLS = process.env.DISCORD_WEBHOOK_URLS; // Comma-separated list

const webhookClients: WebhookClient[] = [];
const sapienceProfileURL = 'https://www.sapience.xyz/profile/';

if (DISCORD_WEBHOOK_URLS) {
  const urls = DISCORD_WEBHOOK_URLS.split(',')
    .map((url) => url.trim())
    .filter((url) => url);

  for (const url of urls) {
    try {
      webhookClients.push(new WebhookClient({ url }));
    } catch (error) {
      console.error(`Failed to create webhook client for URL ${url}:`, error);
    }
  }
}

export const alertEvent = async (
  chainId: number,
  address: string,
  logData: LogData
) => {
  try {
    if (webhookClients.length === 0) {
      console.warn('No Discord webhooks configured, skipping alert');
      return;
    }

    if (logData.eventName === EventType.Transfer) {
      return;
    }

    let title = '';
    const positionId = parseInt(logData.topics[3], 16);
    switch (logData.eventName) {
      case EventType.TraderPositionCreated:
      case EventType.TraderPositionModified: {
        let questionName = 'Unknown Market';
        let collateralSymbol = 'token';
        try {
          const marketObj = await prisma.market_group.findFirst({
            where: { address: address.toLowerCase(), chainId },
            include: { resource: true },
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
        const collateralDisplay = formatToFirstSignificantDecimal(
          Number(formattedCollateral)
        );

        const senderAddress = truncateAddress(
          String(logData.args.sender || '')
        );
        const fullSenderAddress = String(logData.args.sender || '');
        title = `[${senderAddress}](${sapienceProfileURL}${fullSenderAddress}) traded ${collateralDisplay} ${collateralSymbol} in "${questionName}" (Position ID: #${positionId})`;
        break;
      }

      case EventType.LiquidityPositionCreated:
      case EventType.LiquidityPositionIncreased:
      case EventType.LiquidityPositionDecreased:
      case EventType.LiquidityPositionClosed: {
        let questionName = 'Unknown Market';
        let collateralSymbol = 'token';
        try {
          const marketObj = await prisma.market_group.findFirst({
            where: { address: address.toLowerCase(), chainId },
            include: { resource: true },
          });

          if (marketObj) {
            questionName = marketObj.question || 'Unknown Market';
            collateralSymbol = marketObj.collateralSymbol || 'token';
          }
        } catch (error) {
          console.error('Failed to fetch market info:', error);
        }

        const formattedCollateral = formatUnits(
          BigInt(String(logData.args.deltaCollateral || '0')),
          18
        );
        const collateralDisplay = formatToFirstSignificantDecimal(
          Number(formattedCollateral)
        );

        const senderAddress = truncateAddress(
          String(logData.args.sender || '')
        );
        const fullSenderAddress = String(logData.args.sender || '');
        title = `[${senderAddress}](${sapienceProfileURL}${fullSenderAddress}) LPed ${collateralDisplay} ${collateralSymbol} in "${questionName}" (Position ID: #${positionId})`;
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

    for (const webhookClient of webhookClients) {
      await webhookClient.send({
        content: title,
        embeds: [embed],
        username: 'Sapience Alerts',
        avatarURL: 'https://www.sapience.xyz/icons/icon-512x512.png',
      });
    }
  } catch (error) {
    console.error('Failed to send Discord webhook alert:', error);
  }
};
