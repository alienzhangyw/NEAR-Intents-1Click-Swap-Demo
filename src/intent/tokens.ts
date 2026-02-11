import { OneClickService, OpenAPI } from '@defuse-protocol/one-click-sdk-typescript';
import { CONFIG } from '../config';
import type { TokenInfo } from '../types';

let initialized = false;

function initClient() {
  if (initialized) {
    return;
  }
  OpenAPI.BASE = CONFIG.oneClickBaseUrl;
  initialized = true;
}

export async function fetchTokens(): Promise<TokenInfo[]> {
  initClient();
  const data = (await OneClickService.getTokens()) as TokenInfo[];
  return data.sort((a, b) => {
    const chainCompare = a.blockchain.localeCompare(b.blockchain);
    if (chainCompare !== 0) {
      return chainCompare;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}
