import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '', ...props }) => {
  return (
    <div 
      className={`bg-cardSurface border border-borderSubtle rounded-2xl p-6 shadow-lg transition-all duration-300 ${className}`} 
      {...props}
    >
      {title && <h3 className="text-sm font-semibold text-mutedText mb-4">{title}</h3>}
      {children}
    </div>
  );
};
