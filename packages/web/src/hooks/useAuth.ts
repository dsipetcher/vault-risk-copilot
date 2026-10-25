import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/config';

interface AuthUser {
  address: string;
  chainId: number;
}

export function useAuth() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser({
          address: data.address,
          chainId: data.chainId,
        });
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setUser(null);
    }
  }

  async function signIn() {
    if (!address || !chainId) {
      setError('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nonceResponse = await fetch(`${API_BASE_URL}/api/auth/nonce`, {
        credentials: 'include', // server binds the nonce to an httpOnly cookie
      });
      const { nonce } = await nonceResponse.json();

      // viem's EIP-4361 builder: the `siwe` package needs Node's Buffer and
      // throws in the browser bundle.
      const preparedMessage = createSiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Vault Risk Copilot with Ethereum',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
        issuedAt: new Date(),
      });
      const signature = await signMessageAsync({ message: preparedMessage });

      const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: preparedMessage,
          signature,
        }),
      });

      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        throw new Error(error.message || 'Authentication failed');
      }

      const data = await verifyResponse.json();
      setUser({
        address: data.address,
        chainId,
      });
    } catch (err) {
      console.error('Sign in failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  }

  async function signOut() {
    setIsLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      disconnect();
    } catch (err) {
      console.error('Sign out failed:', err);
      setError('Failed to sign out');
    } finally {
      setIsLoading(false);
    }
  }

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    signIn,
    signOut,
  };
}
