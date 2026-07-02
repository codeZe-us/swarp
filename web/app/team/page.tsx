'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ShimmerLoader } from '../../components/ui/ShimmerLoader';
import { Badge } from '../../components/ui/Badge';
import { isValidPublicKey } from '../../lib/stellar';
import { TeamMember } from '../../store/types';

export default function TeamPage() {
  // Zustand Store variables
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  
  // Team slice
  const teamMembers = useStore((state) => state.teamMembers);
  const signersRequired = useStore((state) => state.signersRequired);
  const inviteMember = useStore((state) => state.inviteMember);
  const updateSignersRequired = useStore((state) => state.updateSignersRequired);
  const removeMember = useStore((state) => state.removeMember);
  const activateMember = useStore((state) => state.activateMember);

  const isConnected = status === 'connected';

  // Modal states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Member'>('Member');
  const [formError, setFormError] = useState<string | null>(null);

  // Success save notice for multisig setting
  const [showSavedNotice, setShowSavedNotice] = useState(false);

  const [isFetchingData, setIsFetchingData] = useState(true);

  // Simulate data fetch
  useEffect(() => {
    const timer = setTimeout(() => setIsFetchingData(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Compute active signers (status === Active)
  const activeMembersCount = useMemo(() => {
    return teamMembers.filter((m) => m.status === 'Active').length;
  }, [teamMembers]);

  // Compute pending invites count
  const pendingInvitesCount = useMemo(() => {
    return teamMembers.filter((m) => m.status === 'Pending').length;
  }, [teamMembers]);

  // Invite form submit handler
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!inviteAddress.trim()) {
      setFormError('Please enter a wallet address.');
      return;
    }

    if (!isValidPublicKey(inviteAddress.trim())) {
      setFormError('Invalid Stellar address. Must be a valid public key (G...).');
      return;
    }

    // Check if address is already in team list
    const isDuplicate = teamMembers.some(
      (m) => m.address.toLowerCase() === inviteAddress.trim().toLowerCase()
    );
    if (isDuplicate) {
      setFormError('This address is already a member or has a pending invitation.');
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
    } catch (err: any) {
      setFormError(err?.message || 'Failed to send team invitation.');
    }
  };

  // Change signers required threshold
  const handleSignersThresholdChange = async (count: number) => {
    await updateSignersRequired(count);
    setShowSavedNotice(true);
    setTimeout(() => setShowSavedNotice(false), 2000);
  };

  // Generate Initials Avatar
  const getInitials = (member: TeamMember) => {
    if (member.role === 'Owner') return 'Y';
    const parts = member.name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return member.name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto font-sans">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
      </div>

      {/* Stats Cards Section */}
      {isFetchingData ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Members */}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Members</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {teamMembers.length || '0'}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Total registered workspace users.</p>
        </div>

        {/* Card 2: Signers required */}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Signers required</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {isConnected ? `${signersRequired} of ${activeMembersCount}` : '0 of 0'}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Required signature approvals for run.</p>
        </div>

        {/* Card 3: Pending invites */}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Pending invites</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {pendingInvitesCount}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Invitations currently awaiting acceptance.</p>
        </div>

      </div>
      )}

      {/* Connection Warning Banner */}
      {isFetchingData ? (
        <div className="w-full bg-[#0B0B0C] border border-borderSubtle rounded-[13px] overflow-hidden min-h-[300px]">
          <ShimmerLoader className="w-full h-full min-h-[300px]" borderRadius={13} />
        </div>
      ) : !isConnected ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[12px] p-6 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
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
        </div>
      ) : (
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col gap-6">
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
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
                    
                    {/* Avatar Initials + Name */}
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

                    {/* Wallet Address */}
                    <td className="py-4 pr-4 font-mono text-mutedText font-medium text-xs">
                      {member.address.slice(0, 8)}...{member.address.slice(-8)}
                    </td>

                    {/* Role Badge */}
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

                    {/* Status Badge */}
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

                    {/* Actions */}
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

        </div>
      )}

      {/* Configuration Section & Settings (Owner Editable) */}
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Multi-sig Configuration Panel */}
          <div className="md:col-span-2 bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Multi-sig configuration</span>
              <h3 className="text-md font-bold text-white font-display mt-0.5">Approval Threshold</h3>
              <p className="text-[11px] text-mutedText leading-relaxed mt-1">
                Configure the minimum number of co-signers required to approve and execute batch salary distributions.
              </p>
            </div>

            {/* Threshold drop down selector */}
            <div className="flex items-center gap-4 mt-6">
              <div className="flex items-center gap-2">
                <select
                  value={signersRequired}
                  onChange={(e) => handleSignersThresholdChange(parseInt(e.target.value, 10))}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2 text-white font-mono font-bold outline-none focus:border-[#5E2A8C] text-sm"
                >
                  {Array.from({ length: activeMembersCount }, (_, i) => i + 1).map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-mutedText font-semibold font-display">
                  of <span className="text-white font-mono font-bold">{activeMembersCount}</span> active members required
                </span>
              </div>

              {showSavedNotice && (
                <span className="text-xs text-emerald-400 font-bold font-display animate-pulse flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Settings Saved
                </span>
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-[#1D1D1F] text-[10px] text-mutedText/70 font-semibold leading-normal">
              ℹ️ Multi-signature approval for payroll will be enforced by the pool contract.
            </div>
          </div>

          {/* Explanation panel */}
          <div className="md:col-span-1 bg-[#1D1D1F]/20 border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-brandLightPurple uppercase tracking-wider font-display">Security notice</span>
            <p className="text-xs text-mutedText leading-relaxed mt-2.5">
              Only members with Owner or Admin roles can adjust signature weights on the underlying Stellar accounts. Member invites generate a temporary key that is upgraded on wallet approval.
            </p>
            <div className="w-8 h-8 rounded-full bg-brandPurple/10 border border-brandPurple/20 flex items-center justify-center text-brandLightPurple mt-6">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

        </div>
      )}

      {/* Invited notice info */}
      <p className="text-[10px] text-mutedText/60 text-center leading-relaxed font-semibold max-w-lg mx-auto">
        Invited members receive a one-time link. They connect a Stellar wallet to accept, then appear here, no email account or password required.
      </p>

      {/* Invite Member Form Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 transition-opacity duration-300">
          <div className="w-full max-w-md bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] shadow-2xl relative flex flex-col font-sans overflow-hidden">
            
            {/* Header row */}
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

            {/* Modal Body / Form */}
            <form onSubmit={handleInviteSubmit} className="p-6 flex flex-col gap-4 font-display text-xs">
              
              {/* Name */}
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

              {/* Wallet Address */}
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

              {/* Role Selector */}
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

              {/* Error log alert */}
              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-[9px] p-3 text-red-400 font-semibold leading-relaxed text-[11px] flex items-start gap-2 mt-1">
                  <svg className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{formError}</span>
                </div>
              )}

              {/* Footer controls */}
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

              {/* Footer text specific to modal */}
              <p className="text-[10px] text-mutedText/60 text-center leading-relaxed font-semibold mt-2">
                Invited members receive a one-time link. They connect a Stellar wallet to accept, then appear here, no email account or password required.
              </p>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
