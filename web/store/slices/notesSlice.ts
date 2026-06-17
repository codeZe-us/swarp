import { StateCreator } from 'zustand';
import { Note } from '../types';
import { StoreState } from '../useStore';
import { encryptNotes, decryptNotes } from '../cryptoUtils';

export interface NotesSlice {
  notes: Note[];
  addNote: (note: Note) => Promise<void>;
  updateNote: (noteId: string, updates: Partial<Note>) => Promise<void>;
  loadNotes: (address: string) => Promise<void>;
  clearNotes: () => void;
}

const isBrowser = typeof window !== 'undefined';

export const createNotesSlice: StateCreator<
  StoreState,
  [],
  [],
  NotesSlice
> = (set, get) => ({
  notes: [],
  addNote: async (note) => {
    const address = get().address;
    if (!address) return;

    const updatedNotes = [...get().notes, note];
    set({ notes: updatedNotes });

    if (isBrowser) {
      try {
        const ciphertext = await encryptNotes(address, updatedNotes);
        localStorage.setItem(`swarp_notes_${address}`, ciphertext);
      } catch (error) {
        console.error('Failed to save encrypted notes:', error);
      }
    }
  },
  updateNote: async (noteId, updates) => {
    const address = get().address;
    if (!address) return;

    const updatedNotes = get().notes.map((n) =>
      n.id === noteId ? { ...n, ...updates } : n
    );
    set({ notes: updatedNotes });

    if (isBrowser) {
      try {
        const ciphertext = await encryptNotes(address, updatedNotes);
        localStorage.setItem(`swarp_notes_${address}`, ciphertext);
      } catch (error) {
        console.error('Failed to save encrypted notes:', error);
      }
    }
  },
  loadNotes: async (address) => {
    if (!isBrowser) {
      set({ notes: [] });
      return;
    }

    const saved = localStorage.getItem(`swarp_notes_${address}`);
    if (!saved) {
      set({ notes: [] });
      return;
    }

    try {
      const decrypted = await decryptNotes(address, saved);
      set({ notes: decrypted });
    } catch (error) {
      console.warn('Decryption failed, initializing with empty notes:', error);
      set({ notes: [] });
    }
  },
  clearNotes: () => {
    set({ notes: [] });
  },
});
