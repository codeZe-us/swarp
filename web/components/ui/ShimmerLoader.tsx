import React from 'react';

interface ShimmerLoaderProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export const ShimmerLoader: React.FC<ShimmerLoaderProps> = ({ 
  className = '', 
  width, 
  height, 
  borderRadius = '8px' 
}) => {
  return (
    <div
      className={`relative overflow-hidden bg-white/5 ${className}`}
      style={{
        width,
        height,
        borderRadius,
      }}
    >
      <div 
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
      />
    </div>
  );
};
