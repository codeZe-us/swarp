'use client';

import React, { useEffect, useState } from 'react';
import { isConnected } from '@stellar/freighter-api';
import { useToastStore } from '../store/useToast';

export function FreighterBanner() {
  const [isFreighterMissing, setIsFreighterMissing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const result = await isConnected();
        if (!result.isConnected) {
          useToastStore.getState().addToast({ title: 'Error', message: 'Freighter wallet not found.', severity: 'error' });
          setIsFreighterMissing(true);
        }
      } catch (e) {
        useToastStore.getState().addToast({ title: 'Error', message: 'Freighter wallet not found.', severity: 'error' });
        setIsFreighterMissing(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
