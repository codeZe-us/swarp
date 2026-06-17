import React from 'react';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, className = '', ...props }) => {
  const cleanName = name.trim();
  const initials = cleanName
    ? cleanName
        .split(/\s+/)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '??';

  const colors = [
    'bg-purple-950/40 text-purple-400 border-purple-900/30',
    'bg-indigo-950/40 text-indigo-400 border-indigo-900/30',
    'bg-violet-950/40 text-violet-400 border-violet-900/30',
    'bg-fuchsia-950/40 text-fuchsia-400 border-fuchsia-900/30',
    'bg-pink-950/40 text-pink-400 border-pink-900/30',
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % colors.length;
  const selectedColorClass = colors[colorIndex];

  return (
    <div 
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border select-none ${selectedColorClass} ${className}`} 
      {...props}
    >
      {initials}
    </div>
  );
};
