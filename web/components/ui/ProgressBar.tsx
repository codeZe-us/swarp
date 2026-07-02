import React from 'react';

interface ProgressBarProps {
  progress: number;
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, label, className = '' }) => {
  return (
    <div className={`w-full bg-[#0A0A0C] border border-white/10 rounded-xl p-5 ${className}`}>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-white">{label || 'Processing...'}</span>
        <span className="text-sm font-mono text-[#B488DC]">{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-2.5 bg-black/80 rounded-full overflow-hidden relative shadow-inner">
        <div 
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-300 bg-gradient-to-r from-[#5E2A8C] via-[#B488DC] to-[#4A1F70] bg-[length:200%_auto] animate-gradient shadow-[0_0_10px_rgba(180,136,220,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
