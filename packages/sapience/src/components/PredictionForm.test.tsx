/* eslint-disable sonarjs/no-duplicate-string */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@testing-library/jest-dom';
import PredictionForm from './PredictionForm';

// Define the type locally for the test file, matching PredictionForm.tsx
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string | null;
  epochs?: {
    epochId: string;
    startTime?: string | null;
    endTime?: string | null;
  }[];
  address?: string;
  chainId?: number;
  lowerBound?: string | null;
  upperBound?: string | null;
}

// Mock PredictionInput component and its exported function
jest.mock('./PredictionInput', () => {
  // Mock component that displays received props for verification
  const MockPredictionInput = ({
    market,
    inputType,
    value,
    onChange,
    activeButtonStyle,
    inactiveButtonStyle,
  }: {
    market: any;
    inputType: any;
    value: any;
    onChange: any;
    activeButtonStyle?: any;
    inactiveButtonStyle?: any;
  }) => {
    // Return null if inputType is null, matching the actual component behavior
    if (!inputType) return null;

    return (
      <div data-testid="mock-prediction-input">
        <button
          type="button"
          data-testid="mock-input-change"
          onClick={() => {
            // Always pass 'mock-change' directly to match test expectation
            onChange('mock-change');
          }}
        >
          Mock Change
        </button>
        <span data-testid="mock-input-type">{inputType}</span>
        <span data-testid="mock-input-value">{value}</span>
        <span data-testid="mock-market-options">
          {JSON.stringify(market?.optionNames)}
        </span>
        <span data-testid="mock-market-token">{market?.baseTokenName}</span>
        <span data-testid="mock-active-style">{activeButtonStyle}</span>
        <span data-testid="mock-inactive-style">{inactiveButtonStyle}</span>
      </div>
    );
  };

  return {
    __esModule: true,
    default: MockPredictionInput,
    convertToSqrtPriceX96: jest.fn(() => '79228162514264337593543950336'),
  };
});

// Mock wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({ address: '0x123', chainId: 1 })),
  useWriteContract: jest.fn(() => ({
    writeContract: jest.fn(),
    data: null,
    isPending: false,
    error: null,
  })),
  useTransaction: jest.fn(() => ({
    data: null,
    isSuccess: false,
  })),
}));

// Mock fetch for quoter
global.fetch = jest.fn(
  () =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          direction: 'LONG',
          maxSize: '100000000000000000000', // 100e18
          currentPrice: '0.5',
          expectedPrice: '0.6',
          collateralAvailable: '50000000000000000000', // 50e18
        }),
    }) as Promise<Response>
);

describe('PredictionForm', () => {
  const mockSetFormData = jest.fn();
  const mockHandleTabChange = jest.fn();
  const mockHandlePredictionChange = jest.fn();
  const mockHandleSubmit = jest.fn();
  const defaultFormData = { predictionValue: '', wagerAmount: '' };
  const defaultProps = {
    formData: defaultFormData,
    setFormData: mockSetFormData,
    activeTab: 'predict' as const,
    handleTabChange: mockHandleTabChange,
    handlePredictionChange: mockHandlePredictionChange,
    handleSubmit: mockHandleSubmit,
    isPermitLoadingPermit: false,
    permitData: { permitted: true },
    currentEpochId: null,
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const oneHour = 3600;

  // Reset mocks before each test
  beforeEach(() => {
    mockHandlePredictionChange.mockClear();
  });

  // --- Test Input Type Logic ---

  test('renders options input when multiple active epochs exist', () => {
    const marketData: PredictionMarketType = {
      optionNames: ['Market A', 'Market B'],
      baseTokenName: 'GROUP', // Base token for the group
      lowerBound: null,
      upperBound: null,
      epochs: [
        {
          epochId: '1',
          startTime: String(nowSec - oneHour),
          endTime: String(nowSec + oneHour),
        },
        {
          epochId: '2',
          startTime: String(nowSec - oneHour),
          endTime: String(nowSec + oneHour),
        },
      ],
      address: '0xabc',
      chainId: 1,
    };

    render(<PredictionForm {...defaultProps} marketData={marketData} />);

    expect(screen.getByTestId('mock-input-type')).toHaveTextContent('options');
    expect(screen.getByTestId('mock-market-options')).toHaveTextContent(
      JSON.stringify(['Market A', 'Market B'])
    );
    expect(screen.getByTestId('mock-market-token')).toBeEmptyDOMElement(); // Base token name shouldn't be passed for options
  });

  test('renders Yes/No input when one active epoch has Yes/No bounds', () => {
    const marketData: PredictionMarketType = {
      optionNames: null, // No options for single market
      baseTokenName: 'YESNO_MARKET', // Might have a name, but bounds determine input
      lowerBound: '-92200',
      upperBound: '0',
      epochs: [
        {
          epochId: '1',
          startTime: String(nowSec - oneHour),
          endTime: String(nowSec + oneHour),
        },
        {
          epochId: '2',
          startTime: String(nowSec - 2 * oneHour),
          endTime: String(nowSec - oneHour),
        }, // Inactive
      ],
      address: '0xabc',
      chainId: 1,
    };

    render(<PredictionForm {...defaultProps} marketData={marketData} />);

    expect(screen.getByTestId('mock-input-type')).toHaveTextContent('yesno');
    expect(screen.getByTestId('mock-market-options')).toHaveTextContent('null');
  });

  test('renders number input when one active epoch has non-Yes/No bounds', () => {
    const marketData: PredictionMarketType = {
      optionNames: null,
      baseTokenName: 'ETH Price',
      lowerBound: '1000',
      upperBound: '5000',
      epochs: [
        {
          epochId: '1',
          startTime: String(nowSec - oneHour),
          endTime: String(nowSec + oneHour),
        },
      ],
      address: '0xabc',
      chainId: 1,
    };

    render(<PredictionForm {...defaultProps} marketData={marketData} />);

    expect(screen.getByTestId('mock-input-type')).toHaveTextContent('number');
    expect(screen.getByTestId('mock-market-token')).toHaveTextContent(
      'ETH Price'
    );
    expect(screen.getByTestId('mock-market-options')).toHaveTextContent('null');
  });

  test('renders no input when no epochs are active', () => {
    const marketData: PredictionMarketType = {
      optionNames: ['Old Market'],
      baseTokenName: 'OLD',
      lowerBound: '0',
      upperBound: '1',
      epochs: [
        {
          epochId: '1',
          startTime: String(nowSec - 2 * oneHour),
          endTime: String(nowSec - oneHour),
        }, // Past
      ],
      address: '0xabc',
      chainId: 1,
    };

    render(<PredictionForm {...defaultProps} marketData={marketData} />);

    // Mock input shouldn't render if inputType is null
    expect(
      screen.queryByTestId('mock-prediction-input')
    ).not.toBeInTheDocument();
  });

  test('renders no input when marketData is null or epochs are empty', () => {
    const { rerender } = render(
      <PredictionForm {...defaultProps} marketData={null} />
    );
    expect(
      screen.queryByTestId('mock-prediction-input')
    ).not.toBeInTheDocument();

    rerender(<PredictionForm {...defaultProps} marketData={{ epochs: [] }} />);
    expect(
      screen.queryByTestId('mock-prediction-input')
    ).not.toBeInTheDocument();
  });

  test('handles epochs with invalid or missing timestamps', () => {
    const marketData: PredictionMarketType = {
      optionNames: null,
      baseTokenName: 'Maybe Market',
      lowerBound: '0',
      upperBound: '100',
      epochs: [
        {
          epochId: '1',
          startTime: 'invalid-start',
          endTime: String(nowSec + oneHour),
        },
        { epochId: '2', startTime: null, endTime: String(nowSec + oneHour) },
        {
          epochId: '3',
          startTime: String(nowSec - oneHour),
          endTime: undefined,
        },
        // Add one valid active epoch to ensure it's selected over invalid ones
        {
          epochId: '4',
          startTime: String(nowSec - oneHour),
          endTime: String(nowSec + oneHour),
        },
      ],
      address: '0xabc',
      chainId: 1,
    };
    // Suppress console.warn during this test
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    render(<PredictionForm {...defaultProps} marketData={marketData} />);

    // Should fall back to the number input based on the single valid epoch
    expect(screen.getByTestId('mock-input-type')).toHaveTextContent('number');
    expect(screen.getByTestId('mock-market-token')).toHaveTextContent(
      'Maybe Market'
    );
    // Check that warnings were logged for invalid epochs
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Epoch 1 has invalid or missing timestamps'
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Epoch 2 has invalid or missing timestamps'
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Epoch 3 has invalid or missing timestamps'
    );

    consoleWarnSpy.mockRestore(); // Restore console.warn
  });

  // Add more tests: form submission logic, tab switching, quoter interaction, EAS attestation calls etc.
  // Example: test interaction with mock child
  test('calls handlePredictionChange when mock input changes', async () => {
    const marketData: PredictionMarketType = {
      optionNames: null,
      baseTokenName: 'TEST',
      lowerBound: '0',
      upperBound: '1',
      epochs: [
        {
          epochId: '1',
          startTime: String(nowSec - oneHour),
          endTime: String(nowSec + oneHour),
        },
      ],
      address: '0xabc',
      chainId: 1,
    };
    render(<PredictionForm {...defaultProps} marketData={marketData} />);

    await act(async () => {
      await userEvent.click(screen.getByTestId('mock-input-change'));
    });

    expect(mockHandlePredictionChange).toHaveBeenCalledWith('mock-change');
  });
});
