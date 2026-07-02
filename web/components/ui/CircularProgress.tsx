import React from 'react';

interface CircularProgressProps {
  size?: number;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({ size = 20, className = '' }) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg className="w-full h-full animate-spin" viewBox="0 0 50 50">
        <defs>
          <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5E2A8C" />
            <stop offset="50%" stopColor="#B488DC">
              <animate attributeName="stop-color" values="#B488DC; #7C3AED; #B488DC" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#4A1F70" />
          </linearGradient>
        </defs>
        <circle
          className="text-white/10"
          strokeWidth="5"
          stroke="currentColor"
          fill="transparent"
          r="20"
          cx="25"
          cy="25"
        />
        <circle
          className="drop-shadow-[0_0_8px_rgba(180,136,220,0.5)]"
          strokeWidth="5"
          strokeDasharray="90 150"
          strokeLinecap="round"
          stroke="url(#purpleGradient)"
          fill="transparent"
          r="20"
          cx="25"
          cy="25"
        />
      </svg>
    </div>
  );
};
