import { BrowserProvider, Contract } from 'ethers';
import type { TokenInfo } from '../types';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
];

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type WalletState = {
  address: string;
  chainId: number;
};

function getProvider(): Eip1193Provider {
  const provider = (window as { ethereum?: Eip1193Provider }).ethereum;
  if (!provider) {
    throw new Error('未检测到 MetaMask');
  }
  return provider;
}

export async function connectEvmWallet(): Promise<WalletState> {
  const provider = getProvider();
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
  return {
    address: accounts[0],
    chainId: Number.parseInt(chainIdHex, 16),
  };
}

export function onEvmEvents(handler: (address: string | null, chainId: number | null) => void) {
  const provider = (window as { ethereum?: Eip1193Provider }).ethereum;
  if (!provider?.on) {
    return;
  }
  provider.on('accountsChanged', async (accounts: unknown) => {
    const list = Array.isArray(accounts) ? (accounts as string[]) : [];
    const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
    handler(list[0] ?? null, Number.parseInt(chainIdHex, 16));
  });
  provider.on('chainChanged', async (chainId: unknown) => {
    const parsed = typeof chainId === 'string' ? Number.parseInt(chainId, 16) : null;
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    handler(accounts[0] ?? null, parsed);
  });
}

type SendDepositParams = {
  token: TokenInfo;
  to: string;
  amountBase: string;
  expectedChainId: number | null;
};

export async function sendEvmDeposit(params: SendDepositParams): Promise<string> {
  const provider = getProvider();
  const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
  const chainId = Number.parseInt(chainIdHex, 16);
  if (params.expectedChainId && params.expectedChainId !== chainId) {
    throw new Error(`请切换到链 ID ${params.expectedChainId}`);
  }

  const browserProvider = new BrowserProvider(provider as unknown as {
    request: (args: { method: string; params?: Array<unknown> | Record<string, unknown> }) => Promise<unknown>;
  });
  const signer = await browserProvider.getSigner();

  const contractAddress = params.token.contractAddress ?? '';
  const isErc20 = contractAddress !== '' && contractAddress.toLowerCase() !== 'native';

  if (isErc20) {
    const contract = new Contract(contractAddress, ERC20_ABI, signer);
    const tx = await contract.transfer(params.to, params.amountBase);
    return tx.hash as string;
  }

  const tx = await signer.sendTransaction({
    to: params.to,
    value: BigInt(params.amountBase),
  });
  return tx.hash as string;
}

export async function getEvmBalance(params: { token: TokenInfo; address: string }): Promise<string> {
  const provider = getProvider();
  const browserProvider = new BrowserProvider(provider as unknown as {
    request: (args: { method: string; params?: Array<unknown> | Record<string, unknown> }) => Promise<unknown>;
  });

  const contractAddress = params.token.contractAddress ?? '';
  const isErc20 = contractAddress !== '' && contractAddress.toLowerCase() !== 'native';

  if (isErc20) {
    const contract = new Contract(contractAddress, ERC20_ABI, browserProvider);
    const balance = await contract.balanceOf(params.address);
    return (balance as bigint).toString();
  }

  const balance = await browserProvider.getBalance(params.address);
  return balance.toString();
}
