import { StateCreator } from 'zustand';
import { Recipient } from '../types';
import { StoreState } from '../useStore';
import { encryptRecipients, decryptRecipients } from '../../lib/crypto';
import { ZendSwapError, handleError } from '../../lib/errors';

export interface PayrollSlice {
  recipients: Recipient[];
  lastRunDate: string | null;
  loadPayroll: (address: string) => Promise<void>;
  addRecipient: (recipient: Omit<Recipient, 'id'>) => Promise<void>;
  updateRecipient: (id: string, updates: Partial<Recipient>) => Promise<void>;
  removeRecipient: (id: string) => Promise<void>;
  runPayroll: () => Promise<void>;
  clearPayroll: () => void;
}

const isBrowser = typeof window !== 'undefined';

export const createPayrollSlice: StateCreator<
  StoreState,
  [],
  [],
  PayrollSlice
> = (set, get) => ({
  recipients: [],
  lastRunDate: null,
  loadPayroll: async (address) => {
    if (!isBrowser) {
      set({ recipients: [], lastRunDate: null });
      return;
    }

    // Load last run date
    const savedLastRun = localStorage.getItem(`swarp_payroll_last_run_${address}`);
    set({ lastRunDate: savedLastRun || null });

    // Load encrypted recipients
    const savedRecipients = localStorage.getItem(`swarp_payroll_recipients_${address}`);
    if (!savedRecipients) {
      set({ recipients: [] });
      return;
    }

    try {
      const decrypted = await decryptRecipients(savedRecipients, address);
      set({ recipients: decrypted });
    } catch (error: unknown) {
      console.warn('Recipients decryption failed:', error);
      handleError(new ZendSwapError({
        code: 'PAYROLL_DECRYPTION_FAILED',
        title: 'Unable to decrypt payroll list',
        message: 'Your browser storage seems to be corrupted or the wallet key has changed. Your payroll list could not be loaded.',
        severity: 'error',
        source: 'browser',
        rawError: error
      }), 'browser');
      set({ recipients: [] });
    }
  },
  addRecipient: async (recipient) => {
    const address = get().address;
    if (!address) return;

    const newRecipient: Recipient = {
      ...recipient,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    };

    const updated = [...get().recipients, newRecipient];
    set({ recipients: updated });

    if (isBrowser) {
      try {
        const ciphertext = await encryptRecipients(updated, address);
        localStorage.setItem(`swarp_payroll_recipients_${address}`, ciphertext);
      } catch (error) {
        console.error('Failed to save encrypted recipients:', error);
      }
    }
  },
  updateRecipient: async (id, updates) => {
    const address = get().address;
    if (!address) return;

    const updated = get().recipients.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    );
    set({ recipients: updated });

    if (isBrowser) {
      try {
        const ciphertext = await encryptRecipients(updated, address);
        localStorage.setItem(`swarp_payroll_recipients_${address}`, ciphertext);
      } catch (error) {
        console.error('Failed to save encrypted recipients:', error);
      }
    }
  },
  removeRecipient: async (id) => {
    const address = get().address;
    if (!address) return;

    const updated = get().recipients.filter((r) => r.id !== id);
    set({ recipients: updated });

    if (isBrowser) {
      try {
        const ciphertext = await encryptRecipients(updated, address);
        localStorage.setItem(`swarp_payroll_recipients_${address}`, ciphertext);
      } catch (error) {
        console.error('Failed to save encrypted recipients:', error);
      }
    }
  },
  runPayroll: async () => {
    const address = get().address;
    if (!address) return;

    // Get current date formatted like "May 31"
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    set({ lastRunDate: formattedDate });

    if (isBrowser) {
      localStorage.setItem(`swarp_payroll_last_run_${address}`, formattedDate);
    }
  },
  clearPayroll: () => {
    set({ recipients: [], lastRunDate: null });
  },
});
