import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useBalance, useReadContract } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseEther, formatEther, erc20Abi, type Address } from 'viem';
import { collateralToken as collateralTokenAddresses } from '@sapience/sdk/contracts';
import { Scene } from './components/Scene';
import { MarketMakerPanel } from './components/MarketMakerPanel';
import { TickerPicker, type SelectedFeed } from './components/TickerPicker';
import { SessionOverlay } from './components/SessionOverlay';
import { AcceptStatusPanel } from './components/AcceptStatusPanel';
import { TransferDialog } from './components/TransferDialog';
import { OCTANTS, type CubeKey } from './components/QuoteCubes';
import { useMarketMaker, type MarketMakerConfig, type WsClient } from './hooks/useMarketMaker';
import { useAutoRFQ } from './hooks/useAutoRFQ';
import { useBidSigner } from './hooks/useBidSigner';
import { useAcceptBid } from './hooks/useAcceptBid';
import { usePythPrices } from './hooks/usePythPrices';
import { useTokenSetup } from './hooks/useTokenSetup';
import { useBidValidator } from './hooks/useBidValidator';
import { useSession } from './lib/SessionContext';
import { getEnvConfig, ROUND_SECONDS, type EnvMode } from './lib/envConfig';

const OCTANT_MAP = new Map(OCTANTS.map((o) => [o.key, o]));

function useUsdBalances(addr: Address | undefined, chainId: number) {
  const wusdeAddress = collateralTokenAddresses[chainId]?.address;
  const { data: nativeBal } = useBalance({
    address: addr,
    chainId,
    query: { enabled: !!addr },
  });
  const { data: wusdeBal } = useReadContract({
    abi: erc20Abi,
    address: wusdeAddress,
    functionName: 'balanceOf',
    args: addr ? [addr] : undefined,
    chainId,
    query: { enabled: !!addr && !!wusdeAddress },
  });
  const usde = nativeBal?.value ?? 0n;
  const wusde = (wusdeBal as bigint) ?? 0n;
  return {
    usde: Number(formatEther(usde)).toFixed(2),
    wusde: Number(formatEther(wusde)).toFixed(2),
  };
}

const SESSION_DURATION_HOURS = 24;

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function App() {
  const [envMode, setEnvMode] = useState<EnvMode>('staging');
  const envConfig = getEnvConfig(envMode);

  const [leg1, setLeg1] = useState<SelectedFeed | null>({ id: 1, symbol: 'Crypto.BTC/USD', ticker: 'BTC', expo: -8 });
  const [leg2, setLeg2] = useState<SelectedFeed | null>({ id: 2, symbol: 'Crypto.ETH/USD', ticker: 'ETH', expo: -8 });
  const [leg3, setLeg3] = useState<SelectedFeed | null>({ id: 85, symbol: 'Crypto.ENA/USD', ticker: 'ENA', expo: -8 });
  const [size, setSize] = useState('0.01');
  const [autoRFQEnabled, setAutoRFQEnabled] = useState(true);

  const [mmConfig, setMmConfig] = useState<MarketMakerConfig>({
    edgeBps: 500,
    maxBid: 10,
    volatility: 0.8,
    correlationCoeff: 0.5,
    autoBidEnabled: false,
  });

  const updateConfig = useCallback((updates: Partial<MarketMakerConfig>) => {
    setMmConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Wallet
  const { address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const handleConnect = useCallback(() => connect({ connector: injected() }), [connect]);
  const handleDisconnect = useCallback(() => disconnect(), [disconnect]);

  // Session
  const {
    isSessionActive,
    startSession,
    endSession,
    isStartingSession,
    isRestoringSession,
    sessionCreationStep,
    sessionError,
    timeRemainingMs,
    effectiveAddress,
    smartAccountAddress,
  } = useSession();

  // Token setup
  const tokenSetup = useTokenSetup(envConfig.chainId);
  const [approveAmount, setApproveAmount] = useState('100');
  const [showApproveInput, setShowApproveInput] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  // Balances for EOA and smart account
  const eoaBalances = useUsdBalances(address, envConfig.chainId);
  const saBalances = useUsdBalances(smartAccountAddress ?? undefined, envConfig.chainId);

  // Auto-start session on wallet connect
  const prevAddress = useRef<string | undefined>(undefined);
  const [sessionOverlayError, setSessionOverlayError] = useState<Error | null>(null);

  useEffect(() => {
    // Wait for restore attempt to finish before auto-creating
    if (isRestoringSession) return;

    const wasConnected = !!prevAddress.current;
    prevAddress.current = address;

    // Fresh wallet connection — auto-create session
    if (address && !wasConnected && !isSessionActive && !isStartingSession) {
      void startSession({ durationHours: SESSION_DURATION_HOURS, etherealChainId: envConfig.chainId }).catch(
        (err) => {
          setSessionOverlayError(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }
  }, [address, isSessionActive, isStartingSession, isRestoringSession, startSession, envConfig.chainId]);

  const handleRetrySession = useCallback(() => {
    setSessionOverlayError(null);
    void startSession({ durationHours: SESSION_DURATION_HOURS, etherealChainId: envConfig.chainId }).catch(
      (err) => setSessionOverlayError(err instanceof Error ? err : new Error(String(err))),
    );
  }, [startSession, envConfig.chainId]);

  const handleSkipSession = useCallback(() => {
    setSessionOverlayError(null);
  }, []);

  const handleEnvSwitch = useCallback((mode: EnvMode) => {
    endSession(); // destroy session for old chain
    setEnvMode(mode);
    const config = getEnvConfig(mode);
    switchChain({ chainId: config.chainId });
  }, [switchChain, endSession]);

  const handleApprove = useCallback(() => {
    const amount = parseEther(approveAmount || '0');
    if (amount > 0n) {
      void tokenSetup.approve(amount);
      setShowApproveInput(false);
    }
  }, [approveAmount, tokenSetup]);

  // Prices
  const { points, latestLeg1, latestLeg2, latestLeg3, frameId } = usePythPrices(leg1, leg2, leg3);

  // Bid signer
  const { signAndSubmitBid } = useBidSigner(envConfig.chainId);

  // Tier 2 bid validator (on-chain sig + nonce + balance/allowance)
  const { validate: validateBid } = useBidValidator(envConfig.chainId);

  // Shared WS client ref — useMarketMaker writes, useAutoRFQ reads
  const sharedClientRef = useRef<WsClient | null>(null);

  // Auto-RFQ (uses shared ref — reads clientRef.current when effects fire)
  const autoRFQ = useAutoRFQ({
    clientRef: sharedClientRef,
    frameId,
    leg1, leg2, leg3,
    latestLeg1, latestLeg2, latestLeg3,
    expirySeconds: ROUND_SECONDS,
    sizeUsde: parseFloat(size) || 1,
    enabled: autoRFQEnabled,
    predictor: effectiveAddress ?? address,
    chainId: envConfig.chainId,
    validateBid,
  });

  // Accept bid (predictor signs + sends mint tx)
  const { acceptBid, acceptLog, clearLog } = useAcceptBid(autoRFQ.setCubeStatus, envConfig.chainId);

  const handleCubeClick = useCallback((key: CubeKey) => {
    const state = autoRFQ.cubeAuctions[key];
    // Only accept if cube has a quoted bid
    if (state?.status !== 'quoted' || !state.bestBid || !state.auctionMeta) return;

    // Immediate visual feedback (pulse)
    autoRFQ.setCubeStatus(key, { status: 'pending' });

    // Fire-and-forget: acceptBid handles its own error states
    void acceptBid(key, state);
  }, [autoRFQ, acceptBid]);

  // Market maker WS connection + incoming auction processing
  const { quotes, status, clientRef } = useMarketMaker({
    relayerWsUrl: envConfig.relayerWsUrl,
    config: mmConfig,
    escrowAllowanceWei: tokenSetup.escrowAllowance,
    onAuctionAck: autoRFQ.handleAck,
    onAuctionBidsRaw: autoRFQ.handleBids as (payload: { auctionId: string; bids: Array<Record<string, unknown>> }) => void,
    onAuctionExpired: autoRFQ.handleExpired,
    onAuctionFilled: autoRFQ.handleFilled,
    onQuoteComputed: autoRFQ.handleQuoteComputed,
    signAndSubmitBid: mmConfig.autoBidEnabled && address ? signAndSubmitBid : undefined,
  });

  // Keep shared ref in sync with market maker's client
  sharedClientRef.current = clientRef.current;

  // Cube hover tooltip state
  const [hoveredCube, setHoveredCube] = useState<CubeKey | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleCubeHover = useCallback((key: CubeKey | null) => {
    setHoveredCube(key);
  }, []);

  const handleSceneMouseMove = useCallback((e: React.MouseEvent) => {
    mousePos.current = { x: e.clientX, y: e.clientY };
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 12}px`;
      tooltipRef.current.style.top = `${e.clientY + 12}px`;
    }
  }, []);

  const hoveredOctant = hoveredCube ? OCTANT_MAP.get(hoveredCube) : null;
  const hoveredState = hoveredCube ? autoRFQ.cubeAuctions[hoveredCube] : undefined;
  const hoveredBidAmount = hoveredState?.bidAmount ? Number(hoveredState.bidAmount) : null;

  return (
    <div className="app-wrapper">
      <div className="top-bar">
        <span className="top-bar-title">Euphoria 3D</span>
        <div className="top-bar-right">
          {address && (
            <>
              <a
                href="https://stargate.finance/?dstChain=ethereal&dstToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
                target="_blank"
                rel="noopener noreferrer"
                className="wallet-btn"
              >
                Bridge to Ethereal
              </a>
              <span className={`balance-group${isSessionActive ? ' balance-group-dim' : ''}`}>
                <span className="balance-label">EOA</span>
                <span className="balance-addr">{address.slice(0, 6)}...{address.slice(-4)}</span>
                <span className="balance-value">{eoaBalances.usde} USDe</span>
                <span className="balance-value">{eoaBalances.wusde} wUSDe</span>
              </span>
              {smartAccountAddress && (
                <>
                  <button className="wallet-btn" onClick={() => setShowTransfer(true)}>
                    Transfer
                  </button>
                  <span className="balance-group">
                    <span className="balance-label">SA</span>
                    <span className="balance-addr">{smartAccountAddress.slice(0, 6)}...{smartAccountAddress.slice(-4)}</span>
                    <span className="balance-value">{saBalances.usde} USDe</span>
                    <span className="balance-value">{saBalances.wusde} wUSDe</span>
                  </span>
                </>
              )}
            </>
          )}
          <div className="top-bar-session">
            {address && isSessionActive && (
              <span className="session-badge session-badge-active">
                <span className="session-dot session-dot-active" />
                <span>Session</span>
                <span className="session-time">{formatTimeRemaining(timeRemainingMs)}</span>
              </span>
            )}
            {address && !isSessionActive && isRestoringSession && (
              <span className="session-badge session-badge-restoring">
                <span className="session-dot session-dot-inactive" />
                <span>Restoring...</span>
              </span>
            )}
            {address && !isSessionActive && !isRestoringSession && !isStartingSession && (
              <span className="session-badge session-badge-none">
                <span className="session-dot session-dot-expired" />
                <span>No Session</span>
                <button
                  className="session-establish-btn"
                  onClick={() =>
                    void startSession({ durationHours: SESSION_DURATION_HOURS, etherealChainId: envConfig.chainId }).catch(
                      (err) => setSessionOverlayError(err instanceof Error ? err : new Error(String(err))),
                    )
                  }
                >
                  Connect
                </button>
              </span>
            )}
          </div>
          <span className="top-bar-wallet">
            {address ? (
              <button className="wallet-btn" onClick={handleDisconnect}>Disconnect</button>
            ) : (
              <button className="wallet-btn wallet-btn-connect" onClick={handleConnect}>Connect Wallet</button>
            )}
          </span>
          <div className="env-switcher">
            <button
              className={`env-btn ${envMode === 'staging' ? 'env-btn-active' : ''}`}
              onClick={() => handleEnvSwitch('staging')}
            >
              Staging
            </button>
            <button
              className={`env-btn ${envMode === 'main' ? 'env-btn-active' : ''}`}
              onClick={() => handleEnvSwitch('main')}
            >
              Main
            </button>
          </div>
        </div>
      </div>
      <div className="app">
      <div className="panel">
        <div className="panel-header">Binary Options Trader</div>
        <div className="ticker-bar">
          <div className="size-picker">
            <span className="ticker-label">Size</span>
            <div className="ticker-input-wrap">
              <input
                className="ticker-input size-input"
                type="number"
                min="0.01"
                step="0.1"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
              <span className="size-suffix">USDe</span>
            </div>
          </div>
          <TickerPicker label="X" value={leg1} onChange={setLeg1} />
          <TickerPicker label="Z" value={leg2} onChange={setLeg2} />
          <TickerPicker label="Y" value={leg3} onChange={setLeg3} />
        </div>
        {latestLeg1 !== null && latestLeg2 !== null && latestLeg3 !== null && (
          <div className="price-bar">
            <span className="price-tag">
              <span className="price-label">{leg1?.ticker}:</span>
              <span className="price-value">${latestLeg1.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </span>
            <span className="price-tag">
              <span className="price-label">{leg2?.ticker}:</span>
              <span className="price-value">${latestLeg2.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </span>
            <span className="price-tag">
              <span className="price-label">{leg3?.ticker}:</span>
              <span className="price-value">${latestLeg3.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </span>
            <span className="price-tag">
              <span className="price-label">pts:</span>
              <span className="price-value">{points.length}</span>
            </span>
            <label className="auto-rfq-toggle">
              <input
                type="checkbox"
                checked={autoRFQEnabled}
                onChange={(e) => setAutoRFQEnabled(e.target.checked)}
              />
              <span>Auto-RFQ</span>
            </label>
          </div>
        )}
        <div className="scene-wrap" onMouseMove={handleSceneMouseMove}>
          <Scene
            points={points}
            leg1Label={leg1?.ticker ?? ''}
            leg2Label={leg2?.ticker ?? ''}
            leg3Label={leg3?.ticker ?? ''}
            onCubeClick={handleCubeClick}
            onCubeHover={handleCubeHover}
            cubeAuctions={autoRFQ.cubeAuctions}
          />
          <AcceptStatusPanel log={acceptLog} onClear={clearLog} />
        </div>
      </div>
      <div className="panel">
        <MarketMakerPanel
          quotes={quotes}
          config={mmConfig}
          onConfigChange={updateConfig}
          status={status}
          tokenSetup={tokenSetup}
          approveAmount={approveAmount}
          onApproveAmountChange={setApproveAmount}
          showApproveInput={showApproveInput}
          onShowApproveInput={setShowApproveInput}
          onApprove={handleApprove}
          isSessionActive={isSessionActive}
        />
      </div>
      </div>
      <SessionOverlay
        isCreating={isStartingSession}
        step={sessionCreationStep}
        error={sessionOverlayError ?? sessionError}
        onRetry={handleRetrySession}
        onSkip={handleSkipSession}
      />
      {address && smartAccountAddress && (
        <TransferDialog
          open={showTransfer}
          onClose={() => setShowTransfer(false)}
          eoaAddress={address}
          smartAccountAddress={smartAccountAddress}
          chainId={envConfig.chainId}
        />
      )}
      {hoveredCube && hoveredOctant && (
        <div
          ref={tooltipRef}
          className="cube-tooltip"
          style={{ left: mousePos.current.x + 12, top: mousePos.current.y + 12 }}
        >
          <div className={`cube-tooltip-legs${hoveredBidAmount === null ? ' cube-tooltip-legs-only' : ''}`}>
            {[
              { ticker: leg1?.ticker ?? '', isOver: hoveredOctant.leg1Over, price: latestLeg1 },
              { ticker: leg2?.ticker ?? '', isOver: hoveredOctant.leg2Over, price: latestLeg2 },
              { ticker: leg3?.ticker ?? '', isOver: hoveredOctant.leg3Over, price: latestLeg3 },
            ].map((leg, i) => (
              <div key={i} className="cube-tooltip-leg">
                <span className={`cube-tooltip-dir ${leg.isOver ? 'leg-over' : 'leg-under'}`}>
                  {leg.isOver ? '↑' : '↓'}
                </span>
                <span className="leg-ticker">{leg.ticker}</span>
                <span className={leg.isOver ? 'leg-over' : 'leg-under'}>
                  {leg.isOver ? ' OVER' : ' UNDER'}
                </span>
                {leg.price !== null && (
                  <span className="cube-tooltip-strike"> {leg.price!.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                )}
              </div>
            ))}
          </div>
          {hoveredBidAmount !== null && (
            <div className="cube-tooltip-win">
              <div className="cube-tooltip-win-label">{size} USDe TO WIN</div>
              <div className="cube-tooltip-win-amount">{hoveredBidAmount.toFixed(2)} USDe</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
