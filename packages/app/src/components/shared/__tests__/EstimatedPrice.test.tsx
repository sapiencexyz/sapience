import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';

import EstimatedPrice from '../EstimatedPrice';

describe('EstimatedPrice', () => {
  test('renders the probability as a percent with the chance label', () => {
    render(<EstimatedPrice estimatedPrice={0.42} />);
    expect(screen.getByText('42% chance')).toBeInTheDocument();
  });

  test('renders a muted dash when the estimate is null', () => {
    render(<EstimatedPrice estimatedPrice={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('renders a muted dash when the estimate is undefined', () => {
    render(<EstimatedPrice />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('clamps extreme probabilities to <1% and >99%', () => {
    const { rerender } = render(<EstimatedPrice estimatedPrice={0.001} />);
    expect(screen.getByText('<1% chance')).toBeInTheDocument();
    rerender(<EstimatedPrice estimatedPrice={0.999} />);
    expect(screen.getByText('>99% chance')).toBeInTheDocument();
  });

  test('passes a custom className through to the percent text', () => {
    render(<EstimatedPrice estimatedPrice={0.5} className="text-xs" />);
    expect(screen.getByText('50% chance')).toHaveClass('text-xs');
  });
});
