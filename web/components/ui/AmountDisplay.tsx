import React from 'react';

interface AmountDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  amount: number | string;
  asset: 'USDC' | 'EURC' | string;
  decimals?: number;
}

export const AmountDisplay: React.FC<AmountDisplayProps> = ({ 
  amount, 
  asset, 
  decimals = 2, 
  className = '',
  ...props 
}) => {
  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  const formatted = isNaN(parsedAmount) 
    ? '0.00' 
    : parsedAmount.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  const isUSDC = asset.toUpperCase() === 'USDC';
  const isEURC = asset.toUpperCase() === 'EURC';

  return (
    <div className={`inline-flex items-center gap-2 font-mono ${className}`} {...props}>
      <span className="text-white font-bold">{formatted}</span>
      
      <div className="flex items-center gap-1.5 bg-darkBackground border border-borderSubtle px-2 py-0.5 rounded-full text-[10px] font-bold text-mutedText">
        {isUSDC && (
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white font-extrabold leading-none">
            $
          </span>
        )}
        {isEURC && (
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex items-center justify-center text-[7px] text-white font-extrabold leading-none">
            €
          </span>
        )}
        {!isUSDC && !isEURC && (
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
        )}
        <span>{asset}</span>
      </div>
    </div>
  );
};
