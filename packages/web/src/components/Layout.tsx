import { Outlet, Link, useLocation } from 'react-router-dom';

export function Layout() {
  const location = useLocation();

  const navItems = [
    { path: '/pools', label: 'Pools' },
    { path: '/vault', label: 'Vault' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link
                to="/"
                className="flex items-center px-2 text-xl font-bold text-primary-600"
              >
                Vault Risk Copilot
              </Link>
              <div className="ml-6 flex space-x-4">
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
            <div className="flex items-center">
              <span className="px-3 py-1 text-xs font-medium text-yellow-800 bg-yellow-100 rounded-full">
                Testnet Only
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            Educational project - Not financial advice - Testnet only
          </p>
        </div>
      </footer>
    </div>
  );
}
