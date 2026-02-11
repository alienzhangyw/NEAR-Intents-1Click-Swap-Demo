import { OneClickService, OpenAPI, type QuoteRequest } from '@defuse-protocol/one-click-sdk-typescript';
import { CONFIG } from '../config';

let initialized = false;

function initClient() {
  if (initialized) {
    return;
  }
  OpenAPI.BASE = CONFIG.oneClickBaseUrl;
  if (CONFIG.oneClickJwt) {
    OpenAPI.TOKEN = CONFIG.oneClickJwt;
  }
  initialized = true;
}

export async function requestQuote(request: QuoteRequest) {
  initClient();
  return OneClickService.getQuote(request);
}

export async function submitDepositTx(params: {
  txHash: string;
  depositAddress: string;
  memo?: string;
}) {
  initClient();
  return OneClickService.submitDepositTx({
    txHash: params.txHash,
    depositAddress: params.depositAddress,
    memo: params.memo,
  });
}

export async function getExecutionStatus(depositAddress: string, depositMemo?: string) {
  initClient();
  return OneClickService.getExecutionStatus(depositAddress, depositMemo);
}

type ApiErrorShape = {
  status?: number;
  message?: string;
  body?: unknown;
};

function isApiError(error: unknown): error is ApiErrorShape {
  return typeof error === 'object' && error !== null && 'status' in error;
}

export function toErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const body = typeof error.body === 'string' ? error.body : JSON.stringify(error.body);
    const status = error.status ? String(error.status) : '未知状态';
    const message = error.message ?? '请求失败';
    return `${status} ${message} ${body ?? ''}`.trim();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '未知错误';
}
