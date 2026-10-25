import { CONTRACTS_SOURCE_URL, LOCAL_VAULT_README_URL } from '@/lib/vault-config';

export function VaultUnavailable() {
  return (
    <div className="space-y-6 min-w-0" data-testid="vault-unavailable">
      <div>
        <h1 data-testid="vault-title" className="text-2xl sm:text-3xl font-bold text-gray-900">
          Vault
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Local ERC-4626 deposit and redeem (MockUSDC + SimpleVault)
        </p>
      </div>

      <div
        className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm"
        data-testid="vault-unavailable-card"
      >
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 min-w-0">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
            aria-hidden="true"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 7.5A1.5 1.5 0 014.5 6h15A1.5 1.5 0 0121 7.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 16.5v-9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 10h18M8 14h3"
              />
            </svg>
          </div>
          <div className="min-w-0 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Not deployed in this public demo
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The ERC-4626 vault (<code className="font-mono text-xs">MockUSDC</code> +{' '}
              <code className="font-mono text-xs">SimpleVault</code>) is not on Sepolia. The
              hosted demo is for browsing pool risk, not live deposits.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Deposit and redeem work on your machine with Docker Compose and a local Anvil
              chain.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <a
                href={LOCAL_VAULT_README_URL}
                target="_blank"
                rel="noreferrer"
                data-testid="vault-local-readme-link"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-700"
              >
                How to run it locally
              </a>
              <a
                href={CONTRACTS_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                data-testid="vault-contracts-link"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Contract source
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
