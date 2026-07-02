'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ZendSwapError, handleError } from '../../lib/errors';
import { ErrorDisplay } from './ErrorDisplay';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  context?: string;
}

interface State {
  hasError: boolean;
  error: ZendSwapError | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const context = this.props.context || 'react_render';
    const zError = handleError(error, context, false); // don't toast, we render it
    this.setState({ error: zError });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="flex items-center justify-center min-h-[400px] w-full p-6">
          <div className="max-w-md w-full">
            {this.state.error ? (
              <ErrorDisplay 
                error={this.state.error} 
                variant="full-page" 
                onRetry={() => this.setState({ hasError: false, error: null })}
              />
            ) : (
              <div className="p-6 bg-appBackground border border-borderLine rounded-xl text-center space-y-4">
                <div className="text-red-500">
                  <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-primaryText">Something went wrong</h3>
                <p className="text-mutedText">An unexpected error occurred while rendering this component.</p>
                <button
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="mt-4 px-4 py-2 bg-primaryAccent text-black rounded-lg hover:bg-opacity-90 transition-colors"
                >
                  Reload Component
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
