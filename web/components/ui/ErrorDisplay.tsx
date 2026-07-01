'use client';

import React, { useState } from 'react';
import { ZendSwapError } from '../../lib/errors';
import { useToastStore } from '../../store/useToast';

interface ErrorDisplayProps {
  error: ZendSwapError;
  variant?: 'inline' | 'full-page';
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ error, variant = 'inline', onRetry, className = '' }: ErrorDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const details = `Error Code: ${error.code}\nMessage: ${error.message}\nSource: ${error.source}\nRaw: ${String(error.rawError)}`;
    navigator.clipboard.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      useToastStore.getState().addToast({
        title: 'Clipboard access denied',
        message: 'Could not copy error details.',
        severity: 'warning'
      });
    });
  };

  const bgColor = {
    error: 'bg-red-900/10 border-red-500/20 text-red-400',
    warning: 'bg-amber-900/10 border-amber-500/20 text-amber-400',
    info: 'bg-primaryAccent/10 border-primaryAccent/20 text-primaryAccent',
    silent: 'hidden',
    catastrophic: 'bg-red-900/30 border-red-500/50 text-red-400',
  }[error.severity];

  if (error.severity === 'silent') return null;

  return (
    <div className={`rounded-xl border p-5 ${bgColor} ${variant === 'full-page' ? 'max-w-xl mx-auto my-8 shadow-lg' : ''} ${className}`}>
      <div className="flex flex-col space-y-3">
        <div>
          <h3 className="font-semibold text-lg">{error.title}</h3>
          <p className="opacity-90 mt-1">{error.message}</p>
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-3">
            {error.actionLabel && error.actionHandler && (
              <button
                onClick={error.actionHandler}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
              >
                {error.actionLabel}
              </button>
            )}
            
            {onRetry && (!error.actionLabel || !error.actionHandler) && (
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            )}
          </div>

          <button 
            onClick={handleCopy}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity flex items-center gap-1"
            title="Copy error details for support"
          >
            {copied ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      </div>
    </div>
  );
}
