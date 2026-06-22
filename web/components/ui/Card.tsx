import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '', ...props }) => {
  return (
    <div 
      className={`bg-cardSurface border border-borderSubtle rounded-[13px] p-6 shadow-lg transition-all duration-300 font-sans ${className}`} 
      {...props}
    >
      {title && <h3 className="text-sm font-semibold text-mutedText mb-4 font-display">{title}</h3>}
      {children}
    </div>
  );
};
