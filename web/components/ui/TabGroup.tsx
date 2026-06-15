import React from 'react';

interface Tab {
  label: string;
  value: string;
}

interface TabGroupProps {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const TabGroup: React.FC<TabGroupProps> = ({ 
  tabs, 
  value, 
  onChange, 
  className = '' 
}) => {
  return (
    <div 
      className={`flex items-center gap-1.5 bg-darkBackground border border-borderSubtle p-1 rounded-lg ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primaryAccent/50 ${
              active
                ? 'bg-primaryAccent text-white shadow shadow-purple-950/20 font-bold'
                : 'text-mutedText hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
