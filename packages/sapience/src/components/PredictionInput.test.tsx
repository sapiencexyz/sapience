import { render, screen, fireEvent } from '@testing-library/react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';

import '@testing-library/jest-dom';
import PredictionInput, {
  type InputType,
  convertToSqrtPriceX96,
} from './PredictionInput';

// Mock the local PredictionMarketType for testing purposes
interface PredictionMarketType {
  optionNames?: string[] | null;
}

describe('PredictionInput', () => {
  const mockOnChange = jest.fn();
  // Mock market object used in multiple tests - simplify if needed
  const mockMarketWithOptions: PredictionMarketType = {
    optionNames: ['Option A', 'Option B', 'Option C'],
  };
  const mockMarketNumeric: PredictionMarketType = {
    optionNames: null,
  };
  const mockMarketYesNo: PredictionMarketType = {
    optionNames: null,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  // Define the constant unit display string here for reuse
  const testUnitDisplay = 'wstETH / GGas';

  // --- Test rendering based on inputType ---

  test('renders buttons when inputType is options', () => {
    render(
      <PredictionInput
        market={mockMarketWithOptions}
        inputType="options"
        value=""
        onChange={mockOnChange}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Option A' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option B' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option C' })
    ).toBeInTheDocument();
  });

  test('renders Yes/No buttons when inputType is yesno', () => {
    render(
      <PredictionInput
        market={mockMarketYesNo}
        inputType="yesno"
        value=""
        onChange={mockOnChange}
      />
    );
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  test('renders numerical input when inputType is number', () => {
    // Use the defined constant
    render(
      <PredictionInput
        market={mockMarketNumeric}
        inputType="number"
        unitDisplay={testUnitDisplay} // Use constant
        value=""
        onChange={mockOnChange}
      />
    );
    const input = screen.getByLabelText(
      `Enter prediction value in ${testUnitDisplay}` // Use constant
    );
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'number');
    expect(screen.getByText(testUnitDisplay)).toBeInTheDocument(); // Use constant
  });

  test('renders nothing when inputType is null', () => {
    const { container } = render(
      <PredictionInput
        market={mockMarketNumeric}
        inputType={null}
        value=""
        onChange={mockOnChange}
      />
    );
    // Check if the container is empty or doesn't contain the typical inputs
    expect(container.firstChild).toBeNull();
  });

  test('renders fallback message for invalid inputType string', () => {
    render(
      <PredictionInput
        market={mockMarketNumeric}
        inputType={'invalid-type' as InputType}
        value=""
        onChange={mockOnChange}
      />
    );
    // Check for the fallback message defined in the component
    expect(
      screen.getByText('Invalid input configuration.')
    ).toBeInTheDocument();
  });

  // --- Test onChange functionality for each inputType ---

  test('calls onChange with the 1-based index when an option button is clicked (inputType=options)', () => {
    render(
      <PredictionInput
        market={mockMarketWithOptions}
        inputType="options"
        value=""
        onChange={mockOnChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Option B' }));
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith(2); // Option B is at index 1 (2nd item), so value should be 2
  });

  test('calls onChange with Uniswap sqrtx96 values when Yes/No buttons are clicked (inputType=yesno)', () => {
    render(
      <PredictionInput
        market={mockMarketYesNo}
        inputType="yesno"
        value=""
        onChange={mockOnChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(mockOnChange).toHaveBeenCalledWith('79228162514264337593543950336'); // sqrtPriceX96 for yes
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(mockOnChange).toHaveBeenCalledWith('0'); // Value for no
    expect(mockOnChange).toHaveBeenCalledTimes(2);
  });

  test('calls onChange with sqrtPriceX96 when numerical input changes (inputType=number)', () => {
    // Use the defined constant
    render(
      <PredictionInput
        market={mockMarketNumeric}
        inputType="number"
        unitDisplay={testUnitDisplay} // Use constant
        value=""
        onChange={mockOnChange}
      />
    );
    const input = screen.getByLabelText(
      `Enter prediction value in ${testUnitDisplay}` // Use constant
    );
    fireEvent.change(input, { target: { value: '123.45' } });
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    // We're expecting the sqrtPriceX96 value calculated by the function, not the raw input
    expect(mockOnChange).toHaveBeenCalledWith(convertToSqrtPriceX96(123.45));
  });

  test('calls onChange with sqrtPriceX96 of 0 when numerical input is cleared or invalid (inputType=number)', () => {
    // Use the defined constant
    render(
      <PredictionInput
        market={mockMarketNumeric}
        inputType="number"
        unitDisplay={testUnitDisplay} // Use constant
        value={100}
        onChange={mockOnChange}
      />
    );
    const input = screen.getByLabelText(
      `Enter prediction value in ${testUnitDisplay}` // Use constant
    );
    fireEvent.change(input, { target: { value: '' } });
    expect(mockOnChange).toHaveBeenCalledWith('0');
    fireEvent.change(input, { target: { value: 'invalid' } });
    expect(mockOnChange).toHaveBeenCalledWith('0');
    expect(mockOnChange).toHaveBeenCalledTimes(2);
  });

  // --- Test styling based on selected value for each inputType ---

  test('applies active style to selected option button (inputType=options)', () => {
    const activeStyle = 'bg-blue-500';
    const inactiveStyle = 'bg-gray-300';

    // First, render with Option A as selected (value = 1)
    render(
      <PredictionInput
        market={{ optionNames: ['Option A', 'Option B'] }}
        inputType="options"
        value={1} // Index 0 + 1 = 1
        onChange={mockOnChange}
        activeButtonStyle={activeStyle}
        inactiveButtonStyle={inactiveStyle}
      />
    );

    // Use test IDs to identify the buttons
    const button0 = screen.getByTestId('option-button-0');
    const button1 = screen.getByTestId('option-button-1');

    // Check that the active/inactive styles are applied correctly
    expect(button0.className).toContain(activeStyle);
    expect(button1.className).toContain(inactiveStyle);
  });

  test('applies active style to selected Yes/No button (inputType=yesno)', () => {
    const activeStyle = 'bg-green-500';
    const inactiveStyle = 'bg-red-300';

    // Case 1: Test with 'Yes' selected (Uniswap sqrtx96 value)
    const { rerender } = render(
      <PredictionInput
        market={mockMarketYesNo}
        inputType="yesno"
        value="79228162514264337593543950336" // Yes value
        onChange={mockOnChange}
        activeButtonStyle={activeStyle}
        inactiveButtonStyle={inactiveStyle}
      />
    );

    // Get the buttons by their text content
    const yesButton = screen.getByRole('button', { name: 'Yes' });
    const noButton = screen.getByRole('button', { name: 'No' });

    expect(yesButton).toHaveClass(activeStyle);
    expect(noButton).toHaveClass(inactiveStyle);

    // Case 2: Test with 'No' selected (value = 0)
    rerender(
      <PredictionInput
        market={mockMarketYesNo}
        inputType="yesno"
        value="0" // No value
        onChange={mockOnChange}
        activeButtonStyle={activeStyle}
        inactiveButtonStyle={inactiveStyle}
      />
    );

    // Verify styling has changed
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass(
      inactiveStyle
    );
    expect(screen.getByRole('button', { name: 'No' })).toHaveClass(activeStyle);
  });

  // No active/inactive style applies to the numerical input itself, so no test for inputType=number styling.
});
