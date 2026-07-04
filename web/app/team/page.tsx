'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.1 } }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};
import { useStore } from '../../store/useStore';
import { ShimmerLoader } from '../../components/ui/ShimmerLoader';
import { Badge } from '../../components/ui/Badge';
import { isValidPublicKey } from '../../lib/stellar';
import { TeamMember } from '../../store/types';
import { useToastStore } from '../../store/useToast';

export default function TeamPage() {
  
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  
  
  const teamMembers = useStore((state) => state.teamMembers);
  const signersRequired = useStore((state) => state.signersRequired);
  const inviteMember = useStore((state) => state.inviteMember);
  const updateSignersRequired = useStore((state) => state.updateSignersRequired);
  const removeMember = useStore((state) => state.removeMember);
  const activateMember = useStore((state) => state.activateMember);

  const isConnected = status === 'connected';

  
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Member'>('Member');

  const [isFetchingData, setIsFetchingData] = useState(true);

  
  useEffect(() => {
    const timer = setTimeout(() => setIsFetchingData(false), 800);
    return () => clearTimeout(timer);
  }, []);

  
  const activeMembersCount = useMemo(() => {
    return teamMembers.filter((m) => m.status === 'Active').length;
  }, [teamMembers]);

  
  const pendingInvitesCount = useMemo(() => {
    return teamMembers.filter((m) => m.status === 'Pending').length;
  }, [teamMembers]);

  
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteAddress.trim()) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Please enter a wallet address.', severity: 'error' });
      return;
    }

    if (!isValidPublicKey(inviteAddress.trim())) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Invalid Stellar address. Must be a valid public key (G...).', severity: 'error' });
      return;
    }

    
    const isDuplicate = teamMembers.some(
      (m) => m.address.toLowerCase() === inviteAddress.trim().toLowerCase()
    );
    if (isDuplicate) {
      useToastStore.getState().addToast({ title: 'Error', message: 'This address is already a member or has a pending invitation.', severity: 'error' });
      return;
    }

    try {
      await inviteMember(
        inviteName.trim() || 'Invited Member',
        inviteAddress.trim(),
        inviteRole
      );
      setIsInviteOpen(false);
      setInviteName('');
      setInviteAddress('');
      setInviteRole('Member');
      useToastStore.getState().addToast({ title: 'Success', message: 'Team invitation sent.', severity: 'success' });
    } catch (err: any) {
      useToastStore.getState().addToast({ title: 'Error', message: err?.message || 'Failed to send team invitation.', severity: 'error' });
    }
  };

  
  const handleSignersThresholdChange = async (count: number) => {
    await updateSignersRequired(count);
    useToastStore.getState().addToast({ title: 'Success', message: 'Multisig threshold updated.', severity: 'success' });
  };

  
  const getInitials = (member: TeamMember) => {
    if (member.role === 'Owner') return 'Y';
    const parts = member.name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return member.name.slice(0, 2).toUpperCase();
  };

  return (
    <motion.div 
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-8 max-w-5xl mx-auto font-sans"
    >
      
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-brandLightPurple tracking-wider uppercase font-display">Governance</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Team</h1>
          <p className="text-sm text-mutedText mt-1">Members who can view balances and run payroll from this treasury.</p>
        </div>
        <div>
          <button
            onClick={() => setIsInviteOpen(true)}
            disabled={!isConnected}
            className={`px-4 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display flex items-center gap-1.5 shadow-[0_0_20px_rgba(123,55,168,0.2)] border-none disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Invite member
          </button>
        </div>
      </motion.div>

      {/* Top Stats */}
      {isFetchingData ? (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Members */}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Members</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {teamMembers.length || '0'}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Total registered workspace users.</p>
        </div>

        {}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Signers required</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {isConnected ? `${signersRequired} of ${activeMembersCount}` : '0 of 0'}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Required signature approvals for run.</p>
        </div>

        {}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Pending invites</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {pendingInvitesCount}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Invitations currently awaiting acceptance.</p>
        </div>

        </motion.div>
      )}

      {/* Main Content */}
      {isFetchingData ? (
        <motion.div variants={itemVariants} className="w-full bg-[#0B0B0C] border border-borderSubtle rounded-[13px] overflow-hidden min-h-[300px]">
          <ShimmerLoader className="w-full h-full min-h-[300px]" borderRadius={13} />
        </motion.div>
      ) : !isConnected ? (
        <motion.div variants={itemVariants} className="bg-red-500/10 border border-red-500/20 rounded-[12px] p-6 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-display">Wallet Connection Required</h3>
            <p className="text-xs text-mutedText mt-1 max-w-sm">Connect your Stellar wallet to view, invite, or configure multi-sig thresholds for this team treasury.</p>
          </div>
          <button
            onClick={connect}
            className="px-5 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display border-none"
          >
            Connect Wallet
          </button>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col gap-6">
          
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1D1D1F] text-mutedText font-bold uppercase tracking-wider text-[10px] font-display">
                  <th className="pb-3 pr-4">Member</th>
                  <th className="pb-3 pr-4">Wallet</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D1D1F]">
                {teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-[#1D1D1F]/20 group transition duration-150">
                    
                    {}
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brandPurple/20 border border-brandPurple/30 flex items-center justify-center text-white text-xs font-bold font-display select-none">
                          {getInitials(member)}
                        </div>
                        <div>
                          <span className="text-white font-bold block text-sm group-hover:text-brandLightPurple transition duration-150 font-display">
                            {member.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {}
                    <td className="py-4 pr-4 font-mono text-mutedText font-medium text-xs">
                      {member.address.slice(0, 8)}...{member.address.slice(-8)}
                    </td>

                    {}
                    <td className="py-4 pr-4">
                      {member.role === 'Owner' && (
                        <div className="inline-block bg-brandPurple/10 border border-brandPurple/20 px-2.5 py-0.5 rounded text-[10px] font-bold text-brandLightPurple font-display select-none">
                          Owner
                        </div>
                      )}
                      {member.role === 'Admin' && (
                        <div className="inline-block bg-usdcColor/10 border border-usdcColor/20 px-2.5 py-0.5 rounded text-[10px] font-bold text-blue-400 font-display select-none">
                          Admin
                        </div>
                      )}
                      {member.role === 'Member' && (
                        <div className="inline-block bg-[#1D1D1F] border border-[#333336] px-2.5 py-0.5 rounded text-[10px] font-bold text-mutedText font-display select-none">
                          Member
                        </div>
                      )}
                    </td>

                    {}
                    <td className="py-4 pr-4">
                      {member.status === 'Active' ? (
                        <div className="inline-flex items-center gap-1.5 bg-[#5E2A8C]/10 border border-[#5E2A8C]/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-brandLightPurple font-display select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-brandLightPurple" />
                          Active
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-amber-500 font-display select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Pending
                        </div>
                      )}
                    </td>

                    {}
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {member.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => activateMember(member.id)}
                            className="px-2 py-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 rounded-[6px] font-display transition duration-150 uppercase tracking-wider cursor-pointer"
                          >
                            Activate
                          </button>
                        )}
                        {member.role !== 'Owner' && (
                          <button
                            type="button"
                            onClick={() => removeMember(member.id)}
                            className="px-2 py-1 text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-[6px] font-display transition duration-150 uppercase tracking-wider cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </motion.div>
      )}

      {}
      {isConnected && (
        <></>
      )}

      {}
      {/* Footer message */}
      <motion.div variants={itemVariants}>
        <p className="text-[10px] text-mutedText/60 text-center leading-relaxed font-semibold max-w-lg mx-auto">
          Invited members receive a one-time link. They connect a Stellar wallet to accept, then appear here, no email account or password required.
        </p>
      </motion.div>

      {}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 transition-opacity duration-300">
          <div className="w-full max-w-md bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] shadow-2xl relative flex flex-col font-sans overflow-hidden">
            
            {}
            <div className="p-6 pb-4 border-b border-[#1D1D1F]">
              <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Treasury console</span>
              <h2 className="text-xl font-extrabold text-white mt-1 font-display">Invite Member</h2>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="absolute top-5 right-5 text-mutedText hover:text-white transition duration-150 p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {}
            <form onSubmit={handleInviteSubmit} className="p-6 flex flex-col gap-4 font-display text-xs">
              
              {}
              <div className="flex flex-col gap-1.5">
                <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Sofia Rossi"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-semibold"
                />
              </div>

              {}
              <div className="flex flex-col gap-1.5">
                <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Stellar Wallet Address</label>
                <input
                  type="text"
                  placeholder="Starts with G..."
                  value={inviteAddress}
                  onChange={(e) => setInviteAddress(e.target.value)}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-mono font-medium"
                />
              </div>

              {}
              <div className="flex flex-col gap-1.5">
                <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e: any) => setInviteRole(e.target.value)}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-semibold"
                >
                  <option value="Admin">Admin (can approve payroll & view logs)</option>
                  <option value="Member">Member (read-only viewer)</option>
                </select>
              </div>

              {}
              <div className="flex gap-3 mt-4">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 shadow-[0_0_20px_rgba(123,55,168,0.25)] border-none"
                >
                  Invite Member
                </button>
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-3 border border-borderSubtle text-mutedText hover:text-white rounded-[9px] text-xs font-bold uppercase tracking-wider transition duration-150 bg-transparent"
                >
                  Cancel
                </button>
              </div>

              {}
              <p className="text-[10px] text-mutedText/60 text-center leading-relaxed font-semibold mt-2">
                Invited members receive a one-time link. They connect a Stellar wallet to accept, then appear here, no email account or password required.
              </p>

            </form>

          </div>
        </div>
      )}

    </motion.div>
  );
}
