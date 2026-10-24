import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskBadge } from '@/components/RiskBadge';

describe('RiskBadge', () => {
  it('renders category in uppercase', () => {
    render(<RiskBadge category="low" />);
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });

  it('renders category with score when provided', () => {
    render(<RiskBadge category="high" score={7.5} />);
    expect(screen.getByText(/HIGH \(7\.5\)/)).toBeInTheDocument();
  });

  it('applies correct styling for low risk', () => {
    const { container } = render(<RiskBadge category="low" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('green');
  });

  it('applies correct styling for critical risk', () => {
    const { container } = render(<RiskBadge category="critical" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('red');
  });
});
