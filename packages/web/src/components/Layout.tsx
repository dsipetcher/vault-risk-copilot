import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LLMSettingsDialog } from './LLMSettingsDialog';
import { getLLMSettings } from '@/lib/llm-storage';
import { AuthButton } from './AuthButton';

export function Layout() {
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentProvider, setCurrentProvider] = useState(getLLMSettings().provider);
  const [navOpen, setNavOpen] = useState(false);

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
    setCurrentProvider(getLLMSettings().provider);
  };

  const navItems = [
    { path: '/pools', label: 'Pools' },
    { path: '/vault', label: 'Vault' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 py-3 sm:h-16 sm:py-0">
            <div className="flex items-center min-w-0">
              <Link
                to="/"
                className="flex items-center px-2 text-lg sm:text-xl font-bold text-primary-600 truncate"
              >
                Vault Risk Copilot
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium ${
                      location.pathname.startsWith(item.path)
                        ? 'text-primary-600 border-b-2 border-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center flex-wrap justify-end gap-2 min-w-0">
              <AuthButton />
              <span className="px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded whitespace-nowrap">
                LLM: {currentProvider}
              </span>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center px-2 sm:px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                data-testid="llm-settings-button"
              >
                <svg className="h-4 w-4 sm:mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">LLM Settings</span>
              </button>
              <span className="px-2 sm:px-3 py-1 text-xs font-medium text-yellow-800 bg-yellow-100 rounded-full whitespace-nowrap">
                Testnet
              </span>
              <button
                type="button"
                className="sm:hidden inline-flex items-center px-2 py-1 text-xs border rounded"
                onClick={() => setNavOpen((open) => !open)}
                data-testid="mobile-nav-toggle"
                aria-label="Toggle navigation"
              >
                Menu
              </button>
            </div>
          </div>
          {navOpen && (
            <div className="sm:hidden pb-3 flex gap-3">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setNavOpen(false)}
                  className={`px-3 py-2 text-sm font-medium ${
                    location.pathname.startsWith(item.path)
                      ? 'text-primary-600'
                      : 'text-gray-500'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto py-6 px-4 sm:px-6 lg:px-8 min-w-0">
        <Outlet />
      </main>

      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            Educational project - Not financial advice - Testnet only
          </p>
        </div>
      </footer>

      <LLMSettingsDialog isOpen={isSettingsOpen} onClose={handleSettingsClose} />
    </div>
  );
}
