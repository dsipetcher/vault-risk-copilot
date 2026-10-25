import { useAccount, useConnect } from 'wagmi';
import { useAuth } from '../hooks/useAuth';
import { injected } from 'wagmi/connectors';

export function AuthButton() {
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const { user, isAuthenticated, isLoading, error, signIn, signOut } = useAuth();

  if (isLoading) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700">
          {user.address.slice(0, 6)}...{user.address.slice(-4)}
        </span>
        <button
          onClick={signOut}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: injected() })}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={signIn}
        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
      >
        Sign In With Ethereum
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
