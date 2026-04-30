import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  truncateAddress,
  formatCollateral,
  getChainName,
  buildPositionEmbed,
  sendPositionAlert,
  _resetRateLimiter,
  STALE_BLOCK_THRESHOLD_S,
  type PositionAlertData,
} from './discordAlert';

// --- Helpers ---

function makeAlertData(
  overrides: Partial<PositionAlertData> = {}
): PositionAlertData {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    predictor: '0xaabbccddee1122334455aabbccddee1122334455',
    counterparty: '0x1234567890abcdef1234567890abcdef12345678',
    predictorCollateral: '50000000000000000000', // 50 USDe (18 decimals)
    counterpartyCollateral: '100000000000000000000', // 100 USDe
    totalCollateral: '150000000000000000000', // 150 USDe
    predictions: [
      {
        conditionId: '0xabc',
        question: 'BTC above 100k?',
        outcomeYes: true,
      },
    ],
    blockTimestamp: nowSec - 10, // 10 seconds ago (fresh)
    transactionHash:
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    chainId: 42161,
    predictionId:
      '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  };
}

// --- Unit tests for pure functions ---

describe('truncateAddress', () => {
  it('truncates long addresses', () => {
    const result = truncateAddress(
      '0xaabbccddee1122334455aabbccddee1122334455'
    );
    expect(result).toBe('0xaabb…4455');
  });

  it('returns short strings unchanged', () => {
    expect(truncateAddress('0xabcdef')).toBe('0xabcdef');
  });
});

describe('formatCollateral', () => {
  it('formats 18-decimal wei to human-readable', () => {
    // 50 USDe = 50 * 10^18
    expect(formatCollateral('50000000000000000000')).toBe('50');
  });

  it('formats with two decimal places', () => {
    // 1.23 USDe
    expect(formatCollateral('1230000000000000000')).toBe('1.23');
  });

  it('shows <0.01 for dust amounts', () => {
    expect(formatCollateral('1000000000000000')).toBe('<0.01'); // 0.001
  });

  it('returns 0 for zero', () => {
    expect(formatCollateral('0')).toBe('0');
  });

  it('handles 6-decimal tokens (e.g. USDC)', () => {
    expect(formatCollateral('50000000', 6)).toBe('50');
  });

  it('handles large amounts without precision loss', () => {
    // 1,000,000 USDe — beyond Number.MAX_SAFE_INTEGER in wei
    const oneMillionWei = '1000000000000000000000000';
    const result = formatCollateral(oneMillionWei);
    expect(result).toBe('1,000,000');
  });

  it('returns raw string on invalid input', () => {
    expect(formatCollateral('not-a-number')).toBe('not-a-number');
  });
});

describe('getChainName', () => {
  it('returns known chain names', () => {
    expect(getChainName(42161)).toBe('Arbitrum');
    expect(getChainName(8453)).toBe('Base');
    expect(getChainName(1)).toBe('Ethereum');
    expect(getChainName(11155111)).toBe('Sepolia');
    expect(getChainName(5064014)).toBe('Ethereal');
    expect(getChainName(13374202)).toBe('Ethereal Testnet');
  });

  it('falls back for unknown chains', () => {
    expect(getChainName(999)).toBe('Chain 999');
  });
});

// --- Embed builder ---

describe('buildPositionEmbed', () => {
  it('builds a valid Discord embed object', () => {
    const data = makeAlertData();
    const embed = buildPositionEmbed(data) as Record<string, unknown>;

    expect(embed.title).toBe('🔮 New Position');
    expect(embed.color).toBe(0x7c3aed);
    expect(embed.timestamp).toBeDefined();

    const fields = embed.fields as Array<{
      name: string;
      value: string;
      inline: boolean;
    }>;
    expect(fields).toHaveLength(6);

    // Predictions field
    expect(fields[0].name).toBe('📋 Predictions');
    expect(fields[0].value).toContain('BTC above 100k?');
    expect(fields[0].value).toContain('**YES**');

    // Predictor
    expect(fields[1].value).toContain('0xaabb…4455');
    expect(fields[1].value).toContain('50 testUSDe');

    // Counterparty
    expect(fields[2].value).toContain('0x1234…5678');
    expect(fields[2].value).toContain('100 testUSDe');

    // Total
    expect(fields[3].value).toContain('150 testUSDe');

    // Position link
    expect(fields[4].name).toBe('📄 Position');
    expect(fields[4].value).toContain('View Position');

    // Transaction link
    expect(fields[5].name).toBe('🔗 Transaction');
    expect(fields[5].value).toContain('arbiscan.io');
  });

  it('shows NO for false predictions', () => {
    const data = makeAlertData({
      predictions: [
        { conditionId: '0x1', question: 'ETH flippening?', outcomeYes: false },
      ],
    });
    const embed = buildPositionEmbed(data) as Record<string, unknown>;
    const fields = embed.fields as Array<{ value: string }>;
    expect(fields[0].value).toContain('**NO**');
  });

  it('handles multiple prediction legs', () => {
    const data = makeAlertData({
      predictions: [
        { conditionId: '0x1', question: 'BTC above 100k?', outcomeYes: true },
        {
          conditionId: '0x2',
          question: 'ETH above 5k?',
          outcomeYes: false,
        },
      ],
    });
    const embed = buildPositionEmbed(data) as Record<string, unknown>;
    const fields = embed.fields as Array<{ value: string }>;
    expect(fields[0].value).toContain('BTC above 100k?');
    expect(fields[0].value).toContain('ETH above 5k?');
  });

  it('uses correct block explorer per chain', () => {
    const base = buildPositionEmbed(makeAlertData({ chainId: 8453 })) as Record<
      string,
      unknown
    >;
    const fields = base.fields as Array<{ name: string; value: string }>;
    const baseTx = fields.find((f) => f.name === '🔗 Transaction');
    expect(baseTx?.value).toContain('basescan.org');

    const sepolia = buildPositionEmbed(
      makeAlertData({ chainId: 11155111 })
    ) as Record<string, unknown>;
    const sepoliaFields = sepolia.fields as Array<{
      name: string;
      value: string;
    }>;
    const sepoliaTx = sepoliaFields.find((f) => f.name === '🔗 Transaction');
    expect(sepoliaTx?.value).toContain('sepolia.etherscan.io');

    const ethereal = buildPositionEmbed(
      makeAlertData({ chainId: 5064014 })
    ) as Record<string, unknown>;
    const etherealFields = ethereal.fields as Array<{
      name: string;
      value: string;
    }>;
    const etherealTx = etherealFields.find((f) => f.name === '🔗 Transaction');
    expect(etherealTx?.value).toContain('explorer.ethereal.trade');

    const etherealTestnet = buildPositionEmbed(
      makeAlertData({ chainId: 13374202 })
    ) as Record<string, unknown>;
    const testnetFields = etherealTestnet.fields as Array<{
      name: string;
      value: string;
    }>;
    const testnetTx = testnetFields.find((f) => f.name === '🔗 Transaction');
    expect(testnetTx?.value).toContain('explorer.etherealtest.net');
  });

  it('handles missing transaction hash gracefully', () => {
    const data = makeAlertData({ transactionHash: '' });
    const embed = buildPositionEmbed(data) as Record<string, unknown>;
    const fields = embed.fields as Array<{ name: string; value: string }>;
    // Only 5 fields: predictions, predictor, counterparty, total, position (no tx link)
    expect(fields).toHaveLength(5);
    expect(fields[4].name).toBe('📄 Position');
    // No transaction field present
    expect(fields.find((f) => f.name === '🔗 Transaction')).toBeUndefined();
  });
});

// --- sendPositionAlert integration ---

describe('sendPositionAlert', () => {
  const originalEnv = process.env.DISCORD_WEBHOOK_URLS;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetRateLimiter();
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    process.env.DISCORD_WEBHOOK_URLS = originalEnv;
    vi.restoreAllMocks();
  });

  it('does not call fetch when no webhook URLs are configured', () => {
    // Module-level DISCORD_WEBHOOK_URLS is already empty in test env
    const data = makeAlertData();
    sendPositionAlert(data);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips stale blocks without calling fetch', () => {
    const staleData = makeAlertData({
      blockTimestamp:
        Math.floor(Date.now() / 1000) - STALE_BLOCK_THRESHOLD_S - 60,
    });
    sendPositionAlert(staleData);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not throw on fresh alert even without webhooks', () => {
    expect(() => sendPositionAlert(makeAlertData())).not.toThrow();
  });
});
