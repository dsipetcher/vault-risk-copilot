import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { ErrorMessage } from '@/components/ErrorMessage';
import { shortenAddress, formatNumber } from '@/lib/utils';

const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
const USDC_ADDRESS = (import.meta.env.VITE_USDC_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

const VAULT_ABI = [
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' }
    ],
    name: 'deposit',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' }
    ],
    name: 'redeem',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export function VaultPage() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [depositAmount, setDepositAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('1000');

  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const { data: sharesBalance, refetch: refetchSharesBalance } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const { data: totalAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
  });

  const { data: totalSupply } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'totalSupply',
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && VAULT_ADDRESS ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();
  const { writeContract: deposit, data: depositHash, isPending: isDepositing } = useWriteContract();
  const { writeContract: redeem, data: redeemHash, isPending: isRedeeming } = useWriteContract();
  const { writeContract: mint, data: mintHash, isPending: isMinting } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  const { isLoading: isRedeemConfirming, isSuccess: isRedeemSuccess } = useWaitForTransactionReceipt({
    hash: redeemHash,
  });

  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  // Log transaction states for debugging
  useEffect(() => {
    if (depositHash) {
      console.log('[DEPOSIT] Transaction sent:', depositHash);
    }
    if (isDepositConfirming) {
      console.log('[DEPOSIT] Waiting for confirmation...');
    }
    if (isDepositSuccess) {
      console.log('[DEPOSIT] Confirmed!');
    }
  }, [depositHash, isDepositConfirming, isDepositSuccess]);

  useEffect(() => {
    if (approveHash) {
      console.log('[APPROVE] Transaction sent:', approveHash);
    }
    if (isApproveConfirming) {
      console.log('[APPROVE] Waiting for confirmation...');
    }
    if (isApproveSuccess) {
      console.log('[APPROVE] Confirmed! Refetching allowance...');
    }
  }, [approveHash, isApproveConfirming, isApproveSuccess]);

  if (isApproveSuccess || isDepositSuccess || isRedeemSuccess || isMintSuccess) {
    setTimeout(() => {
      refetchUsdcBalance();
      refetchSharesBalance();
      refetchAllowance();
    }, 2000);
  }

  const sharePrice = totalAssets && totalSupply && totalSupply > 0n
    ? (Number(totalAssets) / Number(totalSupply))
    : 1;

  const handleApprove = () => {
    if (!depositAmount) return;
    const amount = parseUnits(depositAmount, 6);
    approve({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, amount],
    });
  };

  const handleDeposit = () => {
    if (!depositAmount) return;
    const amount = parseUnits(depositAmount, 6);
    deposit({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [amount, address as Address],
    });
  };

  const handleRedeem = () => {
    if (!redeemAmount) return;
    const amount = parseUnits(redeemAmount, 18);
    redeem({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'redeem',
      args: [amount, address as Address, address as Address],
    });
  };

  const handleMint = () => {
    if (!mintAmount || !address) return;
    const amount = parseUnits(mintAmount, 6);
    mint({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [address, amount],
    });
  };

  const needsApproval = depositAmount && allowance !== undefined
    ? parseUnits(depositAmount, 6) > allowance
    : false;

  if (!VAULT_ADDRESS || !USDC_ADDRESS) {
    return (
      <ErrorMessage message="Vault or USDC address not configured. Please set VITE_VAULT_ADDRESS and VITE_USDC_ADDRESS." />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 data-testid="vault-title" className="text-3xl font-bold text-gray-900">Vault</h1>
        <p className="mt-2 text-sm text-gray-700">
          Deposit USDC to earn yield from the ERC-4626 vault
        </p>
      </div>

      {!isConnected ? (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Connect Wallet</h2>
          <div className="space-y-2">
            {connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => connect({ connector })}
                data-testid={`connect-${connector.name.toLowerCase()}`}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Connect with {connector.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Connected</h2>
              <button
                onClick={() => disconnect()}
                className="text-sm text-red-600 hover:text-red-900"
              >
                Disconnect
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Address:</span>{' '}
                <span data-testid="connected-address" className="font-mono">{shortenAddress(address!)}</span>
              </div>
              <div>
                <span className="text-gray-600">Network:</span>{' '}
                <span>{chain?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StatCard
              label="USDC Balance"
              value={usdcBalance ? formatUnits(usdcBalance, 6) : '0'}
              testId="usdc-balance"
            />
            <StatCard
              label="Vault Shares"
              value={sharesBalance ? formatUnits(sharesBalance, 18) : '0'}
              testId="vault-shares"
            />
            <StatCard label="Share Price" value={sharePrice.toFixed(6)} />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <StatCard
              label="Total Assets (TVL)"
              value={totalAssets ? formatNumber(Number(formatUnits(totalAssets, 6))) : '0'}
            />
            <StatCard
              label="Total Supply"
              value={totalSupply ? formatUnits(totalSupply, 18) : '0'}
            />
          </div>

          {(chain?.id === 31337 || chain?.testnet) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">Testnet Mint</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  placeholder="Amount"
                  data-testid="mint-amount-input"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
                <button
                  onClick={handleMint}
                  disabled={isMinting || isMintConfirming}
                  data-testid="mint-button"
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                >
                  {isMinting || isMintConfirming ? 'Minting...' : 'Mint USDC'}
                </button>
              </div>
              {isMintSuccess && (
                <p data-testid="mint-success" className="mt-2 text-sm text-green-600">Successfully minted USDC!</p>
              )}
            </div>
          )}

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Deposit</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (USDC)
                </label>
                <input
                  type="text"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.0"
                  data-testid="deposit-amount-input"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              {needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApproving || isApproveConfirming}
                  data-testid="approve-button"
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {isApproving || isApproveConfirming ? 'Approving...' : 'Approve USDC'}
                </button>
              ) : (
                <button
                  onClick={handleDeposit}
                  disabled={!depositAmount || isDepositing || isDepositConfirming}
                  data-testid="deposit-button"
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {isDepositing || isDepositConfirming ? 'Depositing...' : 'Deposit'}
                </button>
              )}
              {isApproveSuccess && (
                <p data-testid="approve-success" className="text-sm text-green-600">Approval successful! Now you can deposit.</p>
              )}
              {isDepositSuccess && (
                <p data-testid="deposit-success" className="text-sm text-green-600">Deposit successful!</p>
              )}
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Redeem</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shares
                </label>
                <input
                  type="text"
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(e.target.value)}
                  placeholder="0.0"
                  data-testid="redeem-amount-input"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <button
                onClick={handleRedeem}
                disabled={!redeemAmount || isRedeeming || isRedeemConfirming}
                data-testid="redeem-button"
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isRedeeming || isRedeemConfirming ? 'Redeeming...' : 'Redeem'}
              </button>
              {isRedeemSuccess && (
                <p data-testid="redeem-success" className="text-sm text-green-600">Redeem successful!</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="bg-white shadow rounded-lg px-4 py-5">
      <dt className="text-sm font-medium text-gray-500 truncate">{label}</dt>
      <dd data-testid={testId} className="mt-1 text-2xl font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
