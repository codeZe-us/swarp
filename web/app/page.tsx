'use client';

import React, { useState } from 'react';

export default function Home() {
  const [amountIn, setAmountIn] = useState('10.0');
  const [amountOut, setAmountOut] = useState('150.0');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStatus, setSwapStatus] = useState('');

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSwapping(true);
    setSwapStatus('Generating zero-knowledge proof...');
    
    // Simulate proof generation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setSwapStatus('Submitting swap to Soroban contract...');
    
    // Simulate transaction submission
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSwapStatus('Transaction settled on-chain!');
    setIsSwapping(false);
    
    setTimeout(() => {
      setSwapStatus('');
    }, 3000);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      {/* Background Glows */}
      <div className="bg-glow-1"></div>
      <div className="bg-glow-2"></div>

      {/* Header */}
      <header className="header">
        <div className="container header-content">
          <div className="logo-text">
            <span className="logo-dot"></span>
            SWARP
          </div>
          <nav>
            <ul className="nav-links">
              <li><a href="#" className="nav-link">Swap</a></li>
              <li><a href="#" className="nav-link">Liquidity</a></li>
              <li><a href="#" className="nav-link">Circuits</a></li>
              <li><a href="#" className="nav-link">Contracts</a></li>
            </ul>
          </nav>
          <button className="btn-connect">Connect Wallet</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container" style={{ position: 'relative', zIndex: 10 }}>
        {/* Hero Section */}
        <section className="hero">
          <div className="badge">
            <span className="badge-dot"></span>
            Soroban + Circom ZK Roll
          </div>
          <h1 className="hero-title">
            <span className="gradient-text">Private & Verifiable</span> Swaps on Stellar
          </h1>
          <p className="hero-description">
            The zero-knowledge privacy layer for Soroban smart contracts. Verify transaction parameters off-chain and settle securely on-chain with full compliance.
          </p>
          <div className="hero-ctas">
            <a href="#swap" className="btn-primary">Launch App</a>
            <a href="https://github.com/stellar/swarp" className="btn-secondary">Read Documentation</a>
          </div>
        </section>

        {/* Swap Interactive Card */}
        <section id="swap" className="swap-section">
          <div className="swap-card">
            <div className="swap-header">
              <h2 className="swap-title">Swarp Token</h2>
              <button 
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                onClick={() => {
                  setAmountIn('10.0');
                  setAmountOut('150.0');
                }}
              >
                Reset
              </button>
            </div>

            <form onSubmit={handleSwap}>
              <div className="input-box">
                <div className="input-label">
                  <span>From (Pay)</span>
                  <span>Balance: 50.0</span>
                </div>
                <div className="input-row">
                  <input 
                    type="text" 
                    className="input-amount" 
                    value={amountIn}
                    onChange={(e) => {
                      setAmountIn(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) {
                        setAmountOut((parsed * 15).toFixed(1));
                      } else {
                        setAmountOut('0.0');
                      }
                    }}
                    disabled={isSwapping}
                  />
                  <div className="asset-badge">
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#2775ca', display: 'inline-block' }}></span>
                    USDC
                  </div>
                </div>
              </div>

              <div className="swap-arrow">
                <div 
                  className="arrow-circle"
                  onClick={() => {
                    const tempIn = amountIn;
                    setAmountIn(amountOut);
                    setAmountOut(tempIn);
                  }}
                >
                  ↓
                </div>
              </div>

              <div className="input-box">
                <div className="input-label">
                  <span>To (Receive, Est.)</span>
                  <span>Balance: 120.0</span>
                </div>
                <div className="input-row">
                  <input 
                    type="text" 
                    className="input-amount" 
                    value={amountOut}
                    readOnly
                    disabled={isSwapping}
                  />
                  <div className="asset-badge">
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#000000', border: '1px solid #ffffff', display: 'inline-block' }}></span>
                    XLM
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-swap" disabled={isSwapping}>
                {isSwapping ? 'Processing...' : 'Generate ZK Proof & Swap'}
              </button>

              {swapStatus && (
                <div style={{ 
                  marginTop: '1.25rem', 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem', 
                  backgroundColor: 'rgba(139, 92, 246, 0.1)', 
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  color: '#c084fc'
                }}>
                  {swapStatus}
                </div>
              )}
            </form>
          </div>
        </section>

        {/* Features Row */}
        <section className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3 className="feature-title">ZK-Snark Privacy</h3>
            <p className="feature-desc">
              Your trade sizes, balances, and counterparties are proven off-chain in zero-knowledge. Compliance and privacy co-exist.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3 className="feature-title">Soroban Speed</h3>
            <p className="feature-desc">
              Rust-based Soroban smart contracts run at native speeds on Stellar, validating proofs with minimal gas and microsecond latency.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎛️</div>
            <h3 className="feature-title">Circom Setup</h3>
            <p className="feature-desc">
              Developer-friendly, standards-compliant Circom circuits compile down to WASM and R1CS files for seamless client integration.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
