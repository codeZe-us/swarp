import { StateCreator } from 'zustand';
import { TeamMember } from '../types';
import { StoreState } from '../useStore';

export interface TeamSlice {
  teamMembers: TeamMember[];
  signersRequired: number;
  loadTeam: (address: string) => Promise<void>;
  inviteMember: (name: string, memberAddress: string, role: 'Admin' | 'Member') => Promise<void>;
  updateSignersRequired: (count: number) => Promise<void>;
  clearTeam: () => void;
  removeMember: (id: string) => Promise<void>;
  activateMember: (id: string) => Promise<void>;
}

const isBrowser = typeof window !== 'undefined';

export const createTeamSlice: StateCreator<
  StoreState,
  [],
  [],
  TeamSlice
> = (set, get) => ({
  teamMembers: [],
  signersRequired: 2,
  loadTeam: async (address) => {
    if (!isBrowser) {
      set({ teamMembers: [], signersRequired: 2 });
      return;
    }

    const savedSigners = localStorage.getItem(`swarp_team_signers_required_${address}`);
    const signersCount = savedSigners ? parseInt(savedSigners, 10) : 2;

    const savedTeam = localStorage.getItem(`swarp_team_${address}`);
    if (!savedTeam) {
      const defaultMembers: TeamMember[] = [
        {
          id: 'owner-id',
          name: 'You',
          address: address,
          role: 'Owner',
          status: 'Active',
        },
      ];

      set({ teamMembers: defaultMembers, signersRequired: signersCount });
      localStorage.setItem(`swarp_team_${address}`, JSON.stringify(defaultMembers));
      localStorage.setItem(`swarp_team_signers_required_${address}`, signersCount.toString());
      return;
    }

    try {
      let parsed = JSON.parse(savedTeam) as TeamMember[];

      let hasOwner = false;
      parsed = parsed.map((m) => {
        if (m.role === 'Owner') {
          hasOwner = true;
          return { ...m, address: address, name: 'You' };
        }
        return m;
      });

      if (!hasOwner) {
        parsed.unshift({
          id: 'owner-id',
          name: 'You',
          address: address,
          role: 'Owner',
          status: 'Active',
        });
      }

      const hasGCR6 = parsed.some((m) => m.address === 'GCR6MLL2HF5RV5NKJSNEMV7MQDKONZ27RYHHMULKF34ICW2QA6QL6FLL');
      if (!hasGCR6) {
        parsed.push({
          id: 'sofia-id',
          name: 'Sofia Rossi',
          address: 'GCR6MLL2HF5RV5NKJSNEMV7MQDKONZ27RYHHMULKF34ICW2QA6QL6FLL',
          role: 'Member',
          status: 'Pending',
        });
      }

      const hasGC2S = parsed.some((m) => m.address === 'GC2S532SGRZ7HVDYMXCULDHLXZL3UQIE4CBKNC2JBAJV7HMTC5CUHNLG');
      if (!hasGC2S) {
        parsed.push({
          id: 'gc2s-id',
          name: 'GC2S Admin',
          address: 'GC2S532SGRZ7HVDYMXCULDHLXZL3UQIE4CBKNC2JBAJV7HMTC5CUHNLG',
          role: 'Admin',
          status: 'Pending',
        });
      }

      set({ teamMembers: parsed, signersRequired: signersCount });
      localStorage.setItem(`swarp_team_${address}`, JSON.stringify(parsed));
    } catch (e) {
      console.warn('Failed to parse saved team, using default fallback:', e);
      set({ teamMembers: [], signersRequired: 2 });
    }
  },
  inviteMember: async (name, memberAddress, role) => {
    const address = get().address;
    if (!address) return;

    const newMember: TeamMember = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      name: name.trim() || 'Invited Member',
      address: memberAddress.trim(),
      role: role,
      status: 'Pending',
    };

    const updated = [...get().teamMembers, newMember];
    set({ teamMembers: updated });

    if (isBrowser) {
      localStorage.setItem(`swarp_team_${address}`, JSON.stringify(updated));
    }
  },
  updateSignersRequired: async (count) => {
    const address = get().address;
    if (!address) return;

    set({ signersRequired: count });

    if (isBrowser) {
      localStorage.setItem(`swarp_team_signers_required_${address}`, count.toString());
    }
  },
  clearTeam: () => {
    set({ teamMembers: [], signersRequired: 2 });
  },
  removeMember: async (id) => {
    const address = get().address;
    if (!address) return;

    const updated = get().teamMembers.filter((m) => m.id !== id || m.role === 'Owner');
    set({ teamMembers: updated });

    if (isBrowser) {
      localStorage.setItem(`swarp_team_${address}`, JSON.stringify(updated));
    }
  },
  activateMember: async (id) => {
    const address = get().address;
    if (!address) return;

    const updated = get().teamMembers.map((m) => {
      if (m.id === id) {
        return { ...m, status: 'Active' as const };
      }
      return m;
    });
    set({ teamMembers: updated });

    if (isBrowser) {
      localStorage.setItem(`swarp_team_${address}`, JSON.stringify(updated));
    }
  },
});
