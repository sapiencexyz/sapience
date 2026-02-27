/**
 * Tests for sessionKeyManager.ts
 *
 * Tests the core session management functions with fully mocked ZeroDev SDK.
 */

import type { Address, Hex } from 'viem';

// Mock environment variables
const mockProjectId = 'test-project-id';
process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID = mockProjectId;
process.env.NEXT_PUBLIC_RPC_URL = 'https://mock-rpc.test';

// Mock addresses
const mockOwnerAddress =
  '0x1234567890123456789012345678901234567890' as Address;
const mockSmartAccountAddress =
  '0xabcdef1234567890abcdef1234567890abcdef12' as Address;
const mockSessionKeyAddress =
  '0x9876543210987654321098765432109876543210' as Address;
const mockPrivateKey =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;

// Mock viem
jest.mock('viem', () => ({
  createPublicClient: jest.fn(() => ({
    chain: { id: 42161 },
    getCode: jest.fn().mockResolvedValue('0x1234'),
  })),
  http: jest.fn((url: string) => ({ url })),
  keccak256: jest.fn(() => '0x' + '1'.repeat(64)),
  parseAbi: jest.fn((abi: string[]) => abi),
  slice: jest.fn(() => '0x12345678'),
  toHex: jest.fn((val: unknown) => '0x' + String(val)),
  encodeAbiParameters: jest.fn(() => '0xencoded'),
  encodeFunctionData: jest.fn(() => '0xencodedFn'),
  recoverTypedDataAddress: jest.fn().mockResolvedValue(mockSessionKeyAddress),
  hashTypedData: jest.fn(() => '0x' + '2'.repeat(64)),
}));

jest.mock('viem/accounts', () => ({
  generatePrivateKey: jest.fn(() => mockPrivateKey),
  privateKeyToAccount: jest.fn(() => ({
    address: mockSessionKeyAddress,
    signMessage: jest.fn(),
    signTypedData: jest.fn(),
  })),
}));

jest.mock('viem/chains', () => ({
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrls: {
      default: { http: ['https://arb1.arbitrum.io/rpc'] },
    },
  },
}));

// Mock @zerodev/sdk
const mockKernelAccount = {
  address: mockSmartAccountAddress,
  kernelPluginManager: {
    getPluginsEnableTypedData: jest.fn(() =>
      Promise.resolve({
        domain: {
          name: 'Kernel',
          version: '0.3.1',
          chainId: 5064014,
          verifyingContract: mockSmartAccountAddress,
        },
        types: {
          Enable: [{ name: 'validationId', type: 'bytes21' }],
        },
        primaryType: 'Enable',
        message: {
          validationId: '0x123',
          nonce: 0,
          hook: '0x0000000000000000000000000000000000000000',
          validatorData: '0x',
          hookData: '0x',
          selectorData: '0x',
        },
      })
    ),
  },
  encodeCalls: jest.fn(),
};

const mockKernelClient = {
  sendUserOperation: jest.fn(),
  waitForUserOperationReceipt: jest.fn(),
};

jest.mock('@zerodev/sdk', () => ({
  createKernelAccount: jest.fn(() => Promise.resolve(mockKernelAccount)),
  createKernelAccountClient: jest.fn(() => mockKernelClient),
  createZeroDevPaymasterClient: jest.fn(() => ({
    sponsorUserOperation: jest.fn(),
  })),
  addressToEmptyAccount: jest.fn((address: Address) => ({
    address,
    type: 'local',
  })),
}));

jest.mock('@zerodev/sdk/constants', () => ({
  getEntryPoint: jest.fn(() => ({
    address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    version: '0.7',
  })),
  KERNEL_V3_1: 'KERNEL_V3_1',
}));

// Mock @zerodev/ecdsa-validator
jest.mock('@zerodev/ecdsa-validator', () => ({
  signerToEcdsaValidator: jest.fn(() =>
    Promise.resolve({
      address: '0xvalidator',
      type: 'ecdsa',
    })
  ),
}));

// Mock @zerodev/permissions
jest.mock('@zerodev/permissions', () => ({
  toPermissionValidator: jest.fn(() =>
    Promise.resolve({
      address: '0xpermissionValidator',
      type: 'permission',
    })
  ),
  deserializePermissionAccount: jest.fn(() =>
    Promise.resolve(mockKernelAccount)
  ),
  serializePermissionAccount: jest.fn(() =>
    Promise.resolve('mock-approval-string')
  ),
}));

jest.mock('@zerodev/permissions/signers', () => ({
  toECDSASigner: jest.fn(() =>
    Promise.resolve({
      address: mockSessionKeyAddress,
      type: 'ecdsa-signer',
    })
  ),
}));

jest.mock('@zerodev/permissions/policies', () => ({
  toCallPolicy: jest.fn(() => ({
    type: 'call-policy',
    permissions: [],
  })),
  toTimestampPolicy: jest.fn(() => ({
    type: 'timestamp-policy',
    validAfter: 0,
    validUntil: 0,
  })),
  toSignatureCallerPolicy: jest.fn(() => ({
    type: 'signature-caller-policy',
  })),
  CallPolicyVersion: {
    V0_0_4: 'V0_0_4',
  },
  ParamCondition: {
    ONE_OF: 'ONE_OF',
  },
}));

// Mock @sapience/sdk
jest.mock('@sapience/sdk/abis', () => ({
  predictionMarketAbi: [],
  predictionMarketEscrowAbi: [],
  collateralTokenAbi: [],
  liquidityVaultAbi: [],
}));

jest.mock('@sapience/sdk/contracts', () => ({
  predictionMarket: {
    5064014: { address: '0xPredictionMarketEthereal' },
    13374202: { address: '0xPredictionMarketEtherealTestnet' },
    42161: { address: '0xPredictionMarketArbitrum' },
  },
  predictionMarketEscrow: {
    5064014: { address: '0xEscrowEthereal' },
    13374202: { address: '0xEscrowEtherealTestnet' },
  },
  collateralToken: {
    5064014: { address: '0xWUSDEEthereal' },
    13374202: { address: '0xWUSDEEtherealTestnet' },
    42161: { address: '0xWUSDEArbitrum' },
  },
  eas: {
    5064014: { address: '0xEASEthereal' },
    13374202: { address: '0xEASEtherealTestnet' },
    42161: { address: '0xEASArbitrum' },
  },
  passiveLiquidityVault: {
    5064014: { address: '0xVaultEthereal' },
    13374202: { address: '0xVaultEtherealTestnet' },
  },
}));

jest.mock('@sapience/sdk/constants', () => ({
  CHAIN_ID_ETHEREAL: 5064014,
  CHAIN_ID_ETHEREAL_TESTNET: 13374202,
  CHAIN_ID_ARBITRUM: 42161,
  DEFAULT_CHAIN_ID: 5064014,
  etherealChain: {
    id: 5064014,
    name: 'Ethereal',
    nativeCurrency: { decimals: 18, name: 'USDe', symbol: 'USDe' },
    rpcUrls: {
      default: { http: ['https://rpc.ethereal.trade'] },
    },
    blockExplorers: {
      default: {
        name: 'Ethereal Explorer',
        url: 'https://explorer.ethereal.trade',
      },
    },
  },
  etherealTestnetChain: {
    id: 13374202,
    name: 'Ethereal Testnet',
    nativeCurrency: { decimals: 18, name: 'USDe', symbol: 'USDe' },
    rpcUrls: {
      default: { http: ['https://rpc.etherealtest.net'] },
    },
    blockExplorers: {
      default: {
        name: 'Ethereal Testnet Explorer',
        url: 'https://explorer.etherealtest.net',
      },
    },
    testnet: true,
  },
}));

// Import after mocks are set up
import {
  getSmartAccountAddress,
  createSession,
  restoreSession,
  saveSession,
  loadSession,
  clearSession,
  SESSION_STORAGE_KEY,
  type SerializedSession,
  type OwnerSigner,
} from './sessionKeyManager';

describe('sessionKeyManager', () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  describe('getSmartAccountAddress', () => {
    it('returns computed smart account address for owner', async () => {
      const address = await getSmartAccountAddress(mockOwnerAddress);

      expect(address).toBe(mockSmartAccountAddress);
    });

    it('calls ZeroDev SDK to create kernel account', async () => {
      const { createKernelAccount } = await import('@zerodev/sdk');
      const { signerToEcdsaValidator } = await import(
        '@zerodev/ecdsa-validator'
      );

      await getSmartAccountAddress(mockOwnerAddress);

      expect(signerToEcdsaValidator).toHaveBeenCalled();
      expect(createKernelAccount).toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    const mockOwnerSigner: OwnerSigner = {
      address: mockOwnerAddress,
      provider: { request: jest.fn() },
      switchChain: jest.fn(),
    };

    it('creates session with correct expiration', async () => {
      const durationHours = 24;
      const beforeTime = Date.now();

      const result = await createSession(mockOwnerSigner, durationHours);

      const afterTime = Date.now();
      const expectedExpiresAt = beforeTime + durationHours * 60 * 60 * 1000;

      expect(result.config.durationHours).toBe(durationHours);
      expect(result.config.expiresAt).toBeGreaterThanOrEqual(expectedExpiresAt);
      expect(result.config.expiresAt).toBeLessThanOrEqual(
        afterTime + durationHours * 60 * 60 * 1000
      );
    });

    it('creates session with owner and smart account addresses', async () => {
      const result = await createSession(mockOwnerSigner, 24);

      expect(result.config.ownerAddress).toBe(mockOwnerAddress);
      expect(result.config.smartAccountAddress).toBe(mockSmartAccountAddress);
    });

    it('returns ethereal client and null arbitrum client', async () => {
      const result = await createSession(mockOwnerSigner, 24);

      expect(result.etherealClient).toBeDefined();
      expect(result.arbitrumClient).toBeNull();
    });

    it('returns serialized session with ethereal approval', async () => {
      const result = await createSession(mockOwnerSigner, 24);

      expect(result.serialized.etherealApproval).toBe('mock-approval-string');
      expect(result.serialized.sessionPrivateKey).toBe(mockPrivateKey);
      expect(result.serialized.sessionKeyAddress).toBe(mockSessionKeyAddress);
    });

    it('switches to Ethereal chain during session creation', async () => {
      await createSession(mockOwnerSigner, 24);

      expect(mockOwnerSigner.switchChain).toHaveBeenCalledWith(5064014); // Ethereal chain ID
    });
  });

  describe('restoreSession', () => {
    const validSerializedSession: SerializedSession = {
      config: {
        durationHours: 24,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
        ownerAddress: mockOwnerAddress,
        smartAccountAddress: mockSmartAccountAddress,
      },
      sessionPrivateKey: mockPrivateKey,
      sessionKeyAddress: mockSessionKeyAddress,
      createdAt: Date.now(),
      etherealApproval: 'mock-ethereal-approval',
    };

    it('restores session from valid serialized data', async () => {
      const result = await restoreSession(validSerializedSession);

      expect(result.config).toEqual(validSerializedSession.config);
      expect(result.etherealClient).toBeDefined();
    });

    it('throws error for expired session', async () => {
      const expiredSession: SerializedSession = {
        ...validSerializedSession,
        config: {
          ...validSerializedSession.config,
          expiresAt: Date.now() - 1000, // Expired 1 second ago
        },
      };

      await expect(restoreSession(expiredSession)).rejects.toThrow(
        'Session has expired'
      );
    });

    it('restores arbitrum client when arbitrumApproval exists', async () => {
      const sessionWithArbitrum: SerializedSession = {
        ...validSerializedSession,
        arbitrumApproval: 'mock-arbitrum-approval',
      };

      const result = await restoreSession(sessionWithArbitrum);

      expect(result.arbitrumClient).toBeDefined();
    });

    it('returns null arbitrum client when arbitrumApproval is missing', async () => {
      const result = await restoreSession(validSerializedSession);

      expect(result.arbitrumClient).toBeNull();
    });
  });

  describe('localStorage operations', () => {
    const mockSerializedSession: SerializedSession = {
      config: {
        durationHours: 24,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        ownerAddress: mockOwnerAddress,
        smartAccountAddress: mockSmartAccountAddress,
      },
      sessionPrivateKey: mockPrivateKey,
      sessionKeyAddress: mockSessionKeyAddress,
      createdAt: Date.now(),
      etherealApproval: 'mock-ethereal-approval',
    };

    describe('saveSession', () => {
      it('saves session to localStorage', () => {
        saveSession(mockSerializedSession);

        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          SESSION_STORAGE_KEY,
          JSON.stringify(mockSerializedSession)
        );
      });
    });

    describe('loadSession', () => {
      it('returns null when no session exists', () => {
        localStorageMock.getItem.mockReturnValueOnce(null);

        const result = loadSession();

        expect(result).toBeNull();
      });

      it('returns session when valid session exists', () => {
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify(mockSerializedSession)
        );

        const result = loadSession();

        expect(result).toEqual(mockSerializedSession);
      });

      it('returns null and clears expired session', () => {
        const expiredSession: SerializedSession = {
          ...mockSerializedSession,
          config: {
            ...mockSerializedSession.config,
            expiresAt: Date.now() - 1000,
          },
        };
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify(expiredSession)
        );

        const result = loadSession();

        expect(result).toBeNull();
        expect(localStorageMock.removeItem).toHaveBeenCalledWith(
          SESSION_STORAGE_KEY
        );
      });

      it('returns null and clears session without etherealApproval (old format)', () => {
        const oldFormatSession = {
          ...mockSerializedSession,
          etherealApproval: undefined,
          arbitrumApproval: 'old-arbitrum-approval',
        };
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify(oldFormatSession)
        );

        const result = loadSession();

        expect(result).toBeNull();
        expect(localStorageMock.removeItem).toHaveBeenCalledWith(
          SESSION_STORAGE_KEY
        );
      });

      it('returns null and clears invalid JSON', () => {
        localStorageMock.getItem.mockReturnValueOnce('invalid-json');

        const result = loadSession();

        expect(result).toBeNull();
        expect(localStorageMock.removeItem).toHaveBeenCalledWith(
          SESSION_STORAGE_KEY
        );
      });
    });

    describe('clearSession', () => {
      it('removes session from localStorage', () => {
        clearSession();

        expect(localStorageMock.removeItem).toHaveBeenCalledWith(
          SESSION_STORAGE_KEY
        );
      });
    });
  });
});
