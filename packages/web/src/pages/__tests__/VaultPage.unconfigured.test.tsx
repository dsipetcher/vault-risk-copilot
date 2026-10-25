import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VaultPage } from '../VaultPage';
import { CONTRACTS_SOURCE_URL, LOCAL_VAULT_README_URL } from '@/lib/vault-config';

describe('VaultPage unconfigured state', () => {
  it('shows a friendly placeholder instead of a raw env error', () => {
    render(<VaultPage />);

    expect(screen.getByTestId('vault-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('vault-title')).toHaveTextContent('Vault');
    expect(screen.getByText(/not deployed in this public demo/i)).toBeInTheDocument();
    expect(screen.getAllByText(/MockUSDC/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SimpleVault/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Docker Compose/i)).toBeInTheDocument();
    expect(screen.getByText(/Anvil/i)).toBeInTheDocument();

    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    expect(screen.queryByText(/VITE_VAULT_ADDRESS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Error$/)).not.toBeInTheDocument();

    expect(screen.queryByTestId('deposit-amount-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('redeem-amount-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('connect-mock')).not.toBeInTheDocument();

    const readme = screen.getByTestId('vault-local-readme-link');
    expect(readme).toHaveAttribute('href', LOCAL_VAULT_README_URL);
    expect(screen.getByTestId('vault-contracts-link')).toHaveAttribute('href', CONTRACTS_SOURCE_URL);

    const card = screen.getByTestId('vault-unavailable-card');
    expect(card.className).not.toMatch(/red-/);
  });
});
