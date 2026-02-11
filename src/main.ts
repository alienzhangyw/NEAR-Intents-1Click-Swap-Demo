import { QuoteRequest, type TokenResponse } from '@defuse-protocol/one-click-sdk-typescript';
import { formatUnits, parseUnits } from 'ethers';
import { CONFIG } from './config';
import { getExecutionStatus, requestQuote, submitDepositTx, toErrorMessage } from './intent/swap';
import { fetchTokens } from './intent/tokens';
import './style.css';
import { connectEvmWallet, getEvmBalance, onEvmEvents, sendEvmDeposit } from './wallet/evm';

type QuoteResponse = Awaited<ReturnType<typeof requestQuote>>;

type AppState = {
  walletAddress: string | null;
  chainId: number | null;
  tokens: TokenResponse[];
  originAssetId: string;
  destinationAssetId: string;
  amount: string;
  recipient: string;
  slippageBps: number;
  swapType: QuoteRequest.swapType;
  appFees: Array<{ recipient: string; fee: number }>;
  quote: QuoteResponse | null;
  depositAddress: string | null;
  depositMemo: string | null;
  status: string;
  isBusy: boolean;
};

const EVM_CHAIN_IDS: Record<string, number> = {
  eth: 1,
  arb: 42161,
  op: 10,
  base: 8453,
  polygon: 137,
  bsc: 56,
  avax: 43114,
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing app container');
}

app.innerHTML = `
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <div class="brand-badge">1Click</div>
        <div>
          <p class="eyebrow">NEAR Intents</p>
          <h1>NEAR Intents 1Click Swap Demo</h1>
          <p class="subtitle">连接 MetaMask，发起跨链兑换意图，自动撮合并完成结算。</p>
        </div>
      </div>
      <div class="wallet">
        <div class="wallet-meta">
          <span id="wallet-status">未连接钱包</span>
          <span id="wallet-address"></span>
        </div>
        <div class="wallet-actions">
          <button id="connect-btn" class="btn primary">连接 MetaMask</button>
          <button id="refresh-btn" class="btn outline hidden" type="button">刷新地址</button>
          <button id="disconnect-btn" class="btn ghost hidden" type="button">断开连接</button>
        </div>
      </div>
    </header>

    <main class="grid">
      <section class="card swap">
        <div class="card-header">
          <h2>兑换参数</h2>
          <p>选择源链资产和目标资产，填写金额与收款地址。</p>
        </div>

        <div class="form-grid">
          <div class="field">
            <label>
              <span>源链资产</span>
              <select id="origin-asset"></select>
            </label>
            <div class="balance">
              <span>余额</span>
              <span>
                <span id="origin-balance">-</span>
                <span id="origin-balance-estimate" class="estimate-inline"> </span>
              </span>
            </div>
          </div>
          <label class="field">
            <span>目标资产</span>
            <select id="destination-asset"></select>
          </label>
          <label class="field">
            <span>报价模式</span>
            <select id="swap-type">
              <option value="EXACT_INPUT">EXACT_INPUT</option>
              <option value="EXACT_OUTPUT">EXACT_OUTPUT</option>
              <option value="FLEX_INPUT">FLEX_INPUT</option>
              <option value="ANY_INPUT">ANY_INPUT</option>
            </select>
          </label>
          <div class="field">
            <span>App Fees (可选)</span>
            <div class="fee-inputs">
              <input id="fee-recipient" type="text" placeholder="recipient.near / 0x..." />
              <input id="fee-amount" type="number" min="1" step="1" placeholder="fee (bps)" />
              <button id="fee-add" type="button" class="btn outline">添加</button>
            </div>
            <div id="fee-list" class="fee-list"></div>
          </div>
          <label class="field">
            <span>兑换数量</span>
            <input id="amount" type="number" min="0" step="any" placeholder="0.0" />
            <div class="estimate">
              <span>估值</span>
              <span id="amount-estimate">-</span>
            </div>
          </label>
          <label class="field">
            <span>收款地址</span>
            <input id="recipient" type="text" placeholder="目标链地址" />
          </label>
          <label class="field">
            <span>滑点容忍度 (bps)</span>
            <input id="slippage" type="number" min="1" max="500" step="1" />
          </label>
          <div class="field hint">
            <span>退款地址</span>
            <p id="refund-address">连接钱包后自动填充</p>
          </div>
        </div>

        <div class="actions">
          <button id="preview-btn" class="btn ghost">预览报价</button>
          <button id="swap-btn" class="btn primary">发起兑换</button>
          <button id="status-btn" class="btn outline">查询状态</button>
        </div>

        <div class="deposit-panel">
          <div>
            <p class="label">存款地址</p>
            <p id="deposit-address" class="mono">-</p>
          </div>
          <div>
            <p class="label">存款 Memo</p>
            <p id="deposit-memo" class="mono">-</p>
          </div>
        </div>
      </section>

      <aside class="side">
        <section class="card">
          <div class="card-header">
            <h3>报价预览</h3>
            <p>使用 dry 模式获取预估价格。</p>
          </div>
          <div id="quote-preview" class="quote-preview">
            <p>等待报价...</p>
          </div>
        </section>
        <section class="card">
          <div class="card-header">
            <h3>执行状态</h3>
            <p>提交存款后可实时跟踪状态。</p>
          </div>
          <div id="swap-status" class="status">尚未开始</div>
          <div id="swap-details" class="status-details"></div>
        </section>
        <section class="card note">
          <h3>提示</h3>
          <ul>
            <li>预览报价使用 dry 模式，不会生成存款地址。</li>
            <li>正式发起后，请按存款地址转账。</li>
            <li>若未配置 JWT，将按照公开费率执行。</li>
          </ul>
        </section>
      </aside>
    </main>

    <footer class="footer">
      <span>1Click API Base: ${CONFIG.oneClickBaseUrl}</span>
      <span>Slippage 默认: ${CONFIG.defaultSlippageBps} bps</span>
    </footer>
  </div>
`;

const state: AppState = {
  walletAddress: null,
  chainId: null,
  tokens: [],
  originAssetId: '',
  destinationAssetId: '',
  amount: '',
  recipient: '',
  slippageBps: CONFIG.defaultSlippageBps,
  swapType: QuoteRequest.swapType.EXACT_INPUT,
  appFees: [],
  quote: null,
  depositAddress: null,
  depositMemo: null,
  status: '尚未开始',
  isBusy: false,
};

let pollHandle: number | null = null;
const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'REFUNDED']);

const elements = {
  connectBtn: document.querySelector<HTMLButtonElement>('#connect-btn')!,
  walletStatus: document.querySelector<HTMLSpanElement>('#wallet-status')!,
  walletAddress: document.querySelector<HTMLSpanElement>('#wallet-address')!,
  originSelect: document.querySelector<HTMLSelectElement>('#origin-asset')!,
  destinationSelect: document.querySelector<HTMLSelectElement>('#destination-asset')!,
  swapTypeSelect: document.querySelector<HTMLSelectElement>('#swap-type')!,
  feeRecipient: document.querySelector<HTMLInputElement>('#fee-recipient')!,
  feeAmount: document.querySelector<HTMLInputElement>('#fee-amount')!,
  feeAdd: document.querySelector<HTMLButtonElement>('#fee-add')!,
  feeList: document.querySelector<HTMLDivElement>('#fee-list')!,
  amountInput: document.querySelector<HTMLInputElement>('#amount')!,
  amountEstimate: document.querySelector<HTMLSpanElement>('#amount-estimate')!,
  recipientInput: document.querySelector<HTMLInputElement>('#recipient')!,
  slippageInput: document.querySelector<HTMLInputElement>('#slippage')!,
  refundAddress: document.querySelector<HTMLParagraphElement>('#refund-address')!,
  previewBtn: document.querySelector<HTMLButtonElement>('#preview-btn')!,
  swapBtn: document.querySelector<HTMLButtonElement>('#swap-btn')!,
  statusBtn: document.querySelector<HTMLButtonElement>('#status-btn')!,
  quotePreview: document.querySelector<HTMLDivElement>('#quote-preview')!,
  swapStatus: document.querySelector<HTMLDivElement>('#swap-status')!,
  swapDetails: document.querySelector<HTMLDivElement>('#swap-details')!,
  depositAddress: document.querySelector<HTMLParagraphElement>('#deposit-address')!,
  depositMemo: document.querySelector<HTMLParagraphElement>('#deposit-memo')!,
  originBalance: document.querySelector<HTMLSpanElement>('#origin-balance')!,
  originBalanceEstimate: document.querySelector<HTMLSpanElement>('#origin-balance-estimate')!,
  refreshBtn: document.querySelector<HTMLButtonElement>('#refresh-btn')!,
  disconnectBtn: document.querySelector<HTMLButtonElement>('#disconnect-btn')!,
};

let balanceRequestId = 0;

elements.slippageInput.value = String(state.slippageBps);
elements.swapTypeSelect.value = state.swapType;
renderFees();

function setBusy(isBusy: boolean) {
  state.isBusy = isBusy;
  elements.previewBtn.disabled = isBusy;
  elements.swapBtn.disabled = isBusy;
  elements.statusBtn.disabled = isBusy;
  elements.connectBtn.disabled = isBusy;
}

function updateWalletView() {
  if (!state.walletAddress) {
    elements.walletStatus.textContent = '未连接钱包';
    elements.walletAddress.textContent = '';
    elements.refundAddress.textContent = '连接钱包后自动填充';
    elements.originBalance.textContent = '-';
    elements.originBalanceEstimate.textContent = '';
    elements.connectBtn.classList.remove('hidden');
    elements.refreshBtn.classList.add('hidden');
    elements.disconnectBtn.classList.add('hidden');
    return;
  }
  elements.walletStatus.textContent = '已连接';
  elements.walletAddress.textContent = `${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`;
  elements.refundAddress.textContent = state.walletAddress;
  elements.connectBtn.classList.add('hidden');
  elements.refreshBtn.classList.remove('hidden');
  elements.disconnectBtn.classList.remove('hidden');
}

function updateQuotePreview(quote: QuoteResponse | null) {
  if (!quote?.quote) {
    elements.quotePreview.innerHTML = '<p>等待报价...</p>';
    return;
  }
  const { quote: details } = quote;
  const originToken = getTokenById(state.originAssetId);
  const destinationToken = getTokenById(state.destinationAssetId);
  const amountOutDisplay = details.amountOutFormatted
    ?? (destinationToken ? formatUnits(details.amountOut ?? '0', destinationToken.decimals) : details.amountOut ?? '-');
  const minAmountOutDisplay = destinationToken && details.minAmountOut
    ? formatUnits(details.minAmountOut, destinationToken.decimals)
    : amountOutDisplay;
  const amountInDisplay = details.amountInFormatted ?? '-';
  const originSymbol = originToken?.symbol ?? '';
  const destinationSymbol = destinationToken?.symbol ?? '';
  const deadline = details.deadline ? new Date(details.deadline) : null;
  const deadlineText = deadline ? deadline.toLocaleString() : '-';
  elements.quotePreview.innerHTML = `
    <div class="quote-row"><span>预计输入</span><strong>${amountInDisplay} ${originSymbol}</strong></div>
    <div class="quote-row"><span>预计输出</span><strong>${amountOutDisplay ?? '-'} ${destinationSymbol}</strong></div>
    <div class="quote-row"><span>最小输出</span><strong>${minAmountOutDisplay ?? '-'} ${destinationSymbol}</strong></div>
    <div class="quote-row"><span>预计耗时</span><strong>${details.timeEstimate ?? '-'}s</strong></div>
    <div class="quote-row"><span>截止时间</span><strong>${deadlineText}</strong></div>
  `;
}

function updateDepositInfo() {
  elements.depositAddress.textContent = state.depositAddress ?? '-';
  elements.depositMemo.textContent = state.depositMemo ?? '-';
}

function updateStatus(message: string, detail?: string) {
  state.status = message;
  elements.swapStatus.textContent = message;
  elements.swapDetails.textContent = detail ?? '';
}

function getTokenById(assetId: string): TokenResponse | undefined {
  return state.tokens.find((token) => token.assetId === assetId);
}

function updateAmountEstimate() {
  const token = getTokenById(state.originAssetId);
  const amount = Number(state.amount);
  if (!token || !Number.isFinite(amount) || amount <= 0 || !token.price) {
    elements.amountEstimate.textContent = '-';
    return;
  }
  const price = Number(token.price);
  if (!Number.isFinite(price)) {
    elements.amountEstimate.textContent = '-';
    return;
  }
  const estimate = amount * price;
  elements.amountEstimate.textContent = `~$${estimate.toFixed(2)}`;
}

function getChainKey(chainId: number | null): string | null {
  if (!chainId) {
    return null;
  }
  const entry = Object.entries(EVM_CHAIN_IDS).find(([, id]) => id === chainId);
  return entry ? entry[0] : null;
}

function buildQuoteRequest(dry: boolean): QuoteRequest {
  const origin = getTokenById(state.originAssetId);
  const destination = getTokenById(state.destinationAssetId);
  if (!origin || !destination) {
    throw new Error('请选择资产');
  }
  if (!state.walletAddress) {
    throw new Error('请先连接钱包');
  }
  if (!state.amount || Number(state.amount) <= 0) {
    throw new Error('请输入兑换数量');
  }
  if (!state.recipient) {
    throw new Error('请输入收款地址');
  }

  const amountBase = parseUnits(state.amount, origin.decimals).toString();
  const deadline = new Date(Date.now() + CONFIG.quoteExpiryMinutes * 60 * 1000).toISOString();

  return {
    dry,
    depositMode: QuoteRequest.depositMode.SIMPLE,
    swapType: state.swapType,
    slippageTolerance: state.slippageBps,
    originAsset: origin.assetId,
    depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
    destinationAsset: destination.assetId,
    amount: amountBase,
    refundTo: state.walletAddress,
    refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
    recipient: state.recipient,
    recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
    connectedWallets: [state.walletAddress],
    sessionId: `demo_${Date.now()}`,
    deadline,
    appFees: state.appFees.length > 0 ? state.appFees : undefined,
  };
}

function renderFees() {
  if (state.appFees.length === 0) {
    elements.feeList.innerHTML = '<span class="fee-empty">未添加</span>';
    return;
  }
  elements.feeList.innerHTML = state.appFees
    .map(
      (fee, index) =>
        `<div class="fee-item"><span>${fee.recipient}</span><span>${fee.fee}</span><button data-index="${index}" type="button">移除</button></div>`
    )
    .join('');
}

function updateSelectOptions() {
  const chainKey = getChainKey(state.chainId);
  const evmTokens = state.tokens.filter((token) => token.blockchain in EVM_CHAIN_IDS);
  const originTokens = chainKey ? evmTokens.filter((token) => token.blockchain === chainKey) : evmTokens;
  const destinationTokens = state.tokens;

  elements.originSelect.innerHTML = originTokens
    .map((token) => `<option value="${token.assetId}">${token.symbol} · ${token.blockchain}</option>`)
    .join('');
  elements.destinationSelect.innerHTML = destinationTokens
    .map((token) => `<option value="${token.assetId}">${token.symbol} · ${token.blockchain}</option>`)
    .join('');

  if (!state.originAssetId || !originTokens.some((token) => token.assetId === state.originAssetId)) {
    state.originAssetId = originTokens[0]?.assetId ?? '';
  }
  if (!state.destinationAssetId && destinationTokens.length > 0) {
    state.destinationAssetId = destinationTokens[0].assetId;
  }
  elements.originSelect.value = state.originAssetId;
  elements.destinationSelect.value = state.destinationAssetId;
  void updateOriginBalance();
  updateAmountEstimate();
}

async function updateOriginBalance() {
  const token = getTokenById(state.originAssetId);
  if (!state.walletAddress || !token) {
    elements.originBalance.textContent = '-';
    elements.originBalanceEstimate.textContent = '';
    return;
  }
  const requestId = ++balanceRequestId;
  elements.originBalance.textContent = '加载中...';
  elements.originBalanceEstimate.textContent = '';
  try {
    const balance = await getEvmBalance({ token, address: state.walletAddress });
    if (requestId !== balanceRequestId) {
      return;
    }
    const formatted = formatUnits(balance, token.decimals);
    elements.originBalance.textContent = formatted;
    if (token.price) {
      const price = Number(token.price);
      const amount = Number(formatted);
      if (Number.isFinite(price) && Number.isFinite(amount)) {
        elements.originBalanceEstimate.textContent = `(~$${(amount * price).toFixed(2)})`;
      }
    }
  } catch (error) {
    if (requestId !== balanceRequestId) {
      return;
    }
    elements.originBalance.textContent = '获取失败';
    elements.originBalanceEstimate.textContent = '';
  }
}

async function handleConnect() {
  try {
    setBusy(true);
    const wallet = await connectEvmWallet();
    state.walletAddress = wallet.address;
    state.chainId = wallet.chainId;
    if (!state.recipient) {
      state.recipient = wallet.address;
      elements.recipientInput.value = wallet.address;
    }
    updateWalletView();
    updateSelectOptions();
    void updateOriginBalance();
    updateAmountEstimate();
  } catch (error) {
    updateStatus('连接失败', toErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function handleRefreshAddress() {
  await handleConnect();
}

function handleDisconnect() {
  const previousAddress = state.walletAddress;
  state.walletAddress = null;
  state.chainId = null;
  if (previousAddress && state.recipient === previousAddress) {
    state.recipient = '';
    elements.recipientInput.value = '';
  }
  updateWalletView();
  updateSelectOptions();
  void updateOriginBalance();
}

async function handlePreview() {
  try {
    setBusy(true);
    updateStatus('获取报价中...');
    const quoteRequest = buildQuoteRequest(true);
    const quote = await requestQuote(quoteRequest);
    state.quote = quote;
    updateQuotePreview(quote);
    updateStatus('报价已更新');
  } catch (error) {
    updateStatus('获取报价失败', toErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function handleSwap() {
  try {
    setBusy(true);
    updateStatus('创建正式报价...');
    const quoteRequest = buildQuoteRequest(false);
    const quote = await requestQuote(quoteRequest);
    state.quote = quote;
    state.depositAddress = quote.quote?.depositAddress ?? null;
    state.depositMemo = quote.quote?.depositMemo ?? null;
    updateDepositInfo();
    updateQuotePreview(quote);

    if (!quote.quote?.depositAddress) {
      throw new Error('未返回存款地址');
    }

    const originToken = getTokenById(state.originAssetId);
    if (!originToken) {
      throw new Error('源资产未找到');
    }

    updateStatus('发送存款交易...');
    const amountBase = parseUnits(state.amount, originToken.decimals).toString();
    const txHash = await sendEvmDeposit({
      token: originToken,
      to: quote.quote.depositAddress,
      amountBase,
      expectedChainId: EVM_CHAIN_IDS[originToken.blockchain] ?? null,
    });

    updateStatus('提交存款哈希...');
    await submitDepositTx({
      txHash,
      depositAddress: quote.quote.depositAddress,
      memo: quote.quote.depositMemo ?? undefined,
    });

    updateStatus('存款已提交，等待执行...');
    startPolling();
  } catch (error) {
    updateStatus('兑换失败', toErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function handleStatus() {
  if (!state.depositAddress) {
    updateStatus('尚无存款地址');
    return;
  }
  try {
    setBusy(true);
    const status = await getExecutionStatus(state.depositAddress, state.depositMemo ?? undefined);
    updateStatus(`当前状态: ${status.status ?? '未知'}`);
    if (status.swapDetails?.amountOutFormatted) {
      elements.swapDetails.textContent = `预计输出 ${status.swapDetails.amountOutFormatted}`;
    }
  } catch (error) {
    updateStatus('查询状态失败', toErrorMessage(error));
  } finally {
    setBusy(false);
  }
}

function startPolling() {
  if (!state.depositAddress) {
    return;
  }
  if (pollHandle) {
    window.clearInterval(pollHandle);
  }
  pollHandle = window.setInterval(async () => {
    try {
      const status = await getExecutionStatus(state.depositAddress!, state.depositMemo ?? undefined);
      updateStatus(`当前状态: ${status.status ?? '未知'}`);
      if (status.swapDetails?.amountOutFormatted) {
        elements.swapDetails.textContent = `预计输出 ${status.swapDetails.amountOutFormatted}`;
      }
      if (status.status && TERMINAL_STATUSES.has(status.status)) {
        window.clearInterval(pollHandle!);
        pollHandle = null;
      }
    } catch (error) {
      updateStatus('自动轮询失败', toErrorMessage(error));
      window.clearInterval(pollHandle!);
      pollHandle = null;
    }
  }, CONFIG.pollIntervalMs);
}

function bindEvents() {
  elements.connectBtn.addEventListener('click', () => {
    void handleConnect();
  });
  elements.refreshBtn.addEventListener('click', () => {
    void handleRefreshAddress();
  });
  elements.disconnectBtn.addEventListener('click', handleDisconnect);
  elements.previewBtn.addEventListener('click', handlePreview);
  elements.swapBtn.addEventListener('click', handleSwap);
  elements.statusBtn.addEventListener('click', handleStatus);
  elements.originSelect.addEventListener('change', (event) => {
    state.originAssetId = (event.target as HTMLSelectElement).value;
    void updateOriginBalance();
    updateAmountEstimate();
  });
  elements.destinationSelect.addEventListener('change', (event) => {
    state.destinationAssetId = (event.target as HTMLSelectElement).value;
  });
  elements.swapTypeSelect.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as QuoteRequest.swapType;
    state.swapType = value;
  });
  elements.feeAdd.addEventListener('click', () => {
    const recipient = elements.feeRecipient.value.trim();
    const fee = Number(elements.feeAmount.value);
    if (!recipient || !Number.isFinite(fee) || fee <= 0) {
      return;
    }
    state.appFees.push({ recipient, fee });
    elements.feeRecipient.value = '';
    elements.feeAmount.value = '';
    renderFees();
  });
  elements.feeList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName !== 'BUTTON') {
      return;
    }
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }
    state.appFees.splice(index, 1);
    renderFees();
  });
  elements.amountInput.addEventListener('input', (event) => {
    state.amount = (event.target as HTMLInputElement).value;
    updateAmountEstimate();
  });
  elements.recipientInput.addEventListener('input', (event) => {
    state.recipient = (event.target as HTMLInputElement).value;
  });
  elements.slippageInput.addEventListener('input', (event) => {
    state.slippageBps = Number((event.target as HTMLInputElement).value || CONFIG.defaultSlippageBps);
  });
}

async function init() {
  bindEvents();
  updateWalletView();
  updateQuotePreview(null);
  updateDepositInfo();
  updateStatus('加载中...');

  try {
    const tokens = await fetchTokens();
    state.tokens = tokens;
    updateSelectOptions();
    updateStatus('已加载支持的资产');
  } catch (error) {
    updateStatus('加载资产失败', toErrorMessage(error));
  }

  onEvmEvents((address, chainId) => {
    state.walletAddress = address;
    state.chainId = chainId;
    updateWalletView();
    updateSelectOptions();
    void updateOriginBalance();
  });
}

void init();
