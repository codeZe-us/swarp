import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: 'private' | 'public' | 'soon' | 'active' | 'pending';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ 
  variant, 
  children, 
  className = '', 
  ...props 
}) => {
  const baseStyle = "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border";
  
  let variantStyle = "";
  let dot = null;

  switch (variant) {
    case 'private':
      variantStyle = "bg-primaryAccent/10 text-purple-400 border-primaryAccent/20";
      break;
    case 'public':
      variantStyle = "bg-slate-900/60 text-slate-400 border-borderSubtle";
      break;
    case 'soon':
      variantStyle = "border-borderSubtle text-mutedText bg-transparent";
      break;
    case 'active':
      variantStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      dot = <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />;
      break;
    case 'pending':
      variantStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
      dot = <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />;
      break;
  }

  return (
    <span className={`${baseStyle} ${variantStyle} ${className}`} {...props}>
      {dot && <span className="mr-1.5 flex items-center">{dot}</span>}
      {children}
    </span>
  );
};
