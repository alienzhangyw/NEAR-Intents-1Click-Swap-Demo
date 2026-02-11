import { OneClickService, OpenAPI, type TokenResponse } from '@defuse-protocol/one-click-sdk-typescript';
import { CONFIG } from '../config';

let initialized = false;

function initClient() {
  if (initialized) {
    return;
  }
  OpenAPI.BASE = CONFIG.oneClickBaseUrl;
  initialized = true;
}

export async function fetchTokens(): Promise<TokenResponse[]> {
  initClient();
  const data = (await OneClickService.getTokens());
  return data.sort((a, b) => {
    const chainCompare = a.blockchain.localeCompare(b.blockchain);
    if (chainCompare !== 0) {
      return chainCompare;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}
