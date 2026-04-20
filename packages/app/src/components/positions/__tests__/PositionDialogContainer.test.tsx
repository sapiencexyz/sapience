import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type {
  PickConfigData,
  PositionBalance,
  Prediction,
} from '~/hooks/graphql/usePositions';

const { mockUsePrediction, mockPredictionDialog } = vi.hoisted(() => ({
  mockUsePrediction: vi.fn(),
  mockPredictionDialog: vi.fn(() => null),
}));

vi.mock('~/hooks/graphql/usePositions', () => ({
  usePrediction: (id?: string) => mockUsePrediction(id),
}));

vi.mock('~/components/positions/PredictionDialog', () => ({
  __esModule: true,
  default: (props: unknown) => mockPredictionDialog(props),
}));

import PositionDialogContainer from '../PositionDialogContainer';

const PREDICTION_ID =
  '0xb8c5b8f93205790de170c51acbded4e107070dadf3098d11bbacfbcab11510cb';

// Position row aggregates 10 identical predictions — pickConfig totals are 10×
// the single prediction's collateral.
const pickConfig: PickConfigData = {
  id: 'pc-1',
  chainId: 42161,
  marketAddress: '0xmarket',
  totalPredictorCollateral: '20210000000000000000', // 20.21 × 10^18
  totalCounterpartyCollateral: '979790000000000000000', // 979.79 × 10^18
  claimedPredictorCollateral: '0',
  claimedCounterpartyCollateral: '0',
  resolved: false,
  result: 'UNRESOLVED',
  resolvedAt: null,
  predictorToken: '0xpred-token',
  counterpartyToken: '0xcp-token',
  endsAt: null,
  isLegacy: false,
  predictionId: PREDICTION_ID,
  picks: [],
};

const position: PositionBalance = {
  id: 1,
  chainId: 42161,
  tokenAddress: '0xcp-token',
  pickConfigId: 'pc-1',
  isPredictorToken: false,
  holder: '0x1f5f0000000000000000000000000000000000ce91',
  balance: '979790000000000000000',
  userCollateral: '979790000000000000000',
  totalPayout: '1000000000000000000000',
  createdAt: '2026-04-20T00:00:00.000Z',
  pickConfig,
};

// A SINGLE prediction's values — 10× smaller than the aggregate totals above.
const fetchedPrediction: Prediction = {
  id: 42,
  predictionId: PREDICTION_ID,
  chainId: 42161,
  marketAddress: '0xmarket',
  predictor: '0x9dc30000000000000000000000000000000000cc74',
  counterparty: '0x1f5f0000000000000000000000000000000000ce91',
  predictorToken: '0xpred-token',
  counterpartyToken: '0xcp-token',
  predictorCollateral: '2030000000000000000', // 2.03 × 10^18
  counterpartyCollateral: '97970000000000000000', // 97.97 × 10^18
  collateralDeposited: null,
  collateralDepositedAt: null,
  settled: false,
  settledAt: null,
  settleTxHash: null,
  result: 'UNRESOLVED',
  predictorClaimable: null,
  counterpartyClaimable: null,
  createTxHash: '0xtx',
  createdAt: '2026-04-20T00:00:00.000Z',
  refCode: null,
  pickConfig,
};

describe('PositionDialogContainer', () => {
  beforeEach(() => {
    mockUsePrediction.mockReset();
    mockPredictionDialog.mockReset();
    mockPredictionDialog.mockReturnValue(null);
  });

  it('fetches the specific prediction by id', () => {
    mockUsePrediction.mockReturnValue({ data: null, isLoading: true });
    render(
      <PositionDialogContainer
        position={position}
        conditionsMap={new Map()}
        collateralSymbol="USDe"
        onClose={() => {}}
      />
    );
    expect(mockUsePrediction).toHaveBeenCalledWith(PREDICTION_ID);
  });

  it('renders nothing until the specific prediction has loaded', () => {
    mockUsePrediction.mockReturnValue({ data: null, isLoading: true });
    render(
      <PositionDialogContainer
        position={position}
        conditionsMap={new Map()}
        collateralSymbol="USDe"
        onClose={() => {}}
      />
    );
    expect(mockPredictionDialog).not.toHaveBeenCalled();
  });

  it('passes the single prediction collateral values (not pickConfig totals) to the dialog', () => {
    mockUsePrediction.mockReturnValue({ data: fetchedPrediction });
    render(
      <PositionDialogContainer
        position={position}
        conditionsMap={new Map()}
        collateralSymbol="USDe"
        onClose={() => {}}
      />
    );

    expect(mockPredictionDialog).toHaveBeenCalledTimes(1);
    const props = mockPredictionDialog.mock.calls[0][0] as {
      prediction: Prediction;
      isPredictorSide: boolean;
    };

    // Must be the specific prediction's amounts, not the aggregate ones on pc
    expect(props.prediction.predictorCollateral).toBe('2030000000000000000');
    expect(props.prediction.counterpartyCollateral).toBe(
      '97970000000000000000'
    );
    expect(props.prediction.predictorCollateral).not.toBe(
      pickConfig.totalPredictorCollateral
    );
    expect(props.prediction.counterpartyCollateral).not.toBe(
      pickConfig.totalCounterpartyCollateral
    );
    expect(props.isPredictorSide).toBe(false);
  });
});
