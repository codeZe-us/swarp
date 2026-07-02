'use client';

import React, { useEffect } from 'react';
import { useToastStore, Toast as ToastType } from '../../store/useToast';

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-end px-4 py-6 sm:p-6 space-y-4"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastType }) {
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        removeToast(toast.id);
      }, toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, removeToast]);

  const bgColor = {
    info: 'bg-appBackground border-borderLine',
    warning: 'bg-amber-900/50 border-amber-500/50',
    error: 'bg-red-900/50 border-red-500/50',
    success: 'bg-green-900/50 border-green-500/50',
  }[toast.severity];

  const iconColor = {
    info: 'text-primaryAccent',
    warning: 'text-amber-400',
    error: 'text-red-400',
    success: 'text-green-400',
  }[toast.severity];

  const icon = {
    info: (
      <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }[toast.severity];

  const isCustomBox = toast.severity === 'error' || toast.severity === 'success';

  const wrapperClass = isCustomBox
    ? `pointer-events-auto w-full max-w-sm rounded-lg p-[1px] bg-gradient-to-r from-primaryAccent via-brandLightPurple to-primaryAccent bg-[length:200%_auto] animate-gradient shadow-lg shadow-primaryAccent/20`
    : `pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 border ${bgColor}`;

  const innerClass = isCustomBox
    ? `w-full h-full bg-[#0B0B0C] rounded-[7px] overflow-hidden border border-transparent`
    : `w-full h-full`;

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {icon}
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              {toast.title && <p className="text-sm font-medium text-white">{toast.title}</p>}
              <p className={`text-sm ${toast.title ? 'mt-1 text-mutedText' : 'text-white'}`}>{toast.message}</p>
              {toast.action && (
                <div className="mt-3 flex">
                  <button
                    type="button"
                    className="rounded-md bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-white/20 transition-colors"
                    onClick={() => {
                      toast.action!.onClick();
                      removeToast(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                </div>
              )}
            </div>
            <div className="ml-4 flex flex-shrink-0">
              <button
                type="button"
                className="inline-flex rounded-md bg-transparent text-mutedText hover:text-white transition-colors"
                onClick={() => removeToast(toast.id)}
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
