import React from 'react';
import { Card } from './Card';

interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  label: string;
  value: string | number;
  subValue?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  subValue, 
  className = '', 
  ...props 
}) => {
  return (
    <Card className={`flex flex-col justify-between ${className}`} {...props}>
      <span className="text-xs font-semibold text-mutedText uppercase tracking-wider">{label}</span>
      <div className="mt-2.5">
        <span className="text-2xl font-bold font-mono text-white tracking-tight">{value}</span>
        {subValue && <p className="text-xs text-mutedText mt-1">{subValue}</p>}
      </div>
    </Card>
  );
};
