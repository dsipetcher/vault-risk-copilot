import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PoolsPage } from '../PoolsPage';

const refetch = vi.fn();

vi.mock('@/hooks/usePools', () => ({
  usePools: () => ({
    data: { data: [], pagination: { total: 0, limit: 50, offset: 0 } },
    isLoading: false,
    error: null,
    refetch,
  }),
}));

describe('PoolsPage empty results', () => {
  beforeEach(() => {
    refetch.mockClear();
  });

  it('keeps search/filter controls visible when there are no matches', async () => {
    render(<PoolsPage />);

    expect(screen.getByTestId('pools-filters')).toBeInTheDocument();
    expect(screen.getByTestId('pools-search')).toBeInTheDocument();
    expect(screen.getByText('No pools found')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('pools-search'), 'zzzz');
    await userEvent.selectOptions(screen.getByTestId('pools-risk-filter'), 'high');
    expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('clear-filters'));
    expect(screen.getByTestId('pools-risk-filter')).toHaveValue('all');
  });
});
