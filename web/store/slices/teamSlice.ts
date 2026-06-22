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

    // Load signers required threshold
    const savedSigners = localStorage.getItem(`swarp_team_signers_required_${address}`);
    const signersCount = savedSigners ? parseInt(savedSigners, 10) : 2;

    // Load team members list
    const savedTeam = localStorage.getItem(`swarp_team_${address}`);
    if (!savedTeam) {
      // Initialize with demo data
      const defaultMembers: TeamMember[] = [
        {
          id: 'owner-id',
          name: 'You',
          address: address,
          role: 'Owner',
          status: 'Active',
        },
        {
          id: 'amara-id',
          name: 'Amara Okafor',
          address: 'GDQPSJ7RZX2XZKM55W347A22Z567KM47Z5X73KXMX7KMK2A4K3Z7K4XM',
          role: 'Admin',
          status: 'Active',
        },
        {
          id: 'liam-id',
          name: 'Liam Schäfer',
          address: 'GBR3UYEWZX2XZKM55W347A22Z567KM47Z5X73KXMX7KMK2A4K3Z7K4XM',
          role: 'Member',
          status: 'Active',
        },
        {
          id: 'sofia-id',
          name: 'Sofia Rossi',
          address: 'GCR6MLL2HF5RV5NKJSNEMV7MQDKONZ27RYHHMULKF34ICW2QA6QL6FLL',
          role: 'Member',
          status: 'Pending',
        },
        {
          id: 'gc2s-id',
          name: 'GC2S Admin',
          address: 'GC2S532SGRZ7HVDYMXCULDHLXZL3UQIE4CBKNC2JBAJV7HMTC5CUHNLG',
          role: 'Admin',
          status: 'Pending',
        },
      ];

      set({ teamMembers: defaultMembers, signersRequired: signersCount });
      localStorage.setItem(`swarp_team_${address}`, JSON.stringify(defaultMembers));
      localStorage.setItem(`swarp_team_signers_required_${address}`, signersCount.toString());
      return;
    }

    try {
      let parsed = JSON.parse(savedTeam) as TeamMember[];

      // Dynamic owner mapping: Ensure the row with role 'Owner' always matches the currently connected address
      let hasOwner = false;
      parsed = parsed.map((m) => {
        if (m.role === 'Owner') {
          hasOwner = true;
          return { ...m, address: address, name: 'You' };
        }
        return m;
      });

      if (!hasOwner) {
        // If somehow no owner row exists, prepend it
        parsed.unshift({
          id: 'owner-id',
          name: 'You',
          address: address,
          role: 'Owner',
          status: 'Active',
        });
      }

      // Ensure GCR6MLL2HF5RV5NKJSNEMV7MQDKONZ27RYHHMULKF34ICW2QA6QL6FLL is present
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

      // Ensure GC2S532SGRZ7HVDYMXCULDHLXZL3UQIE4CBKNC2JBAJV7HMTC5CUHNLG is present
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

    // Filter out the deleted member, but never let them delete the owner row
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
