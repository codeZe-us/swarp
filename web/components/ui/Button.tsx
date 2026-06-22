import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyle = "inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primaryAccent/50 disabled:opacity-50 disabled:cursor-not-allowed select-none font-display";
  
  let variantStyle = "";
  switch (variant) {
    case 'primary':
      variantStyle = "bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white shadow-[0_0_28px_rgba(123,55,168,0.3)] border-none rounded-[12px]";
      break;
    case 'secondary':
      variantStyle = "border border-[rgba(94,42,140,0.4)] hover:bg-[#5E2A8C]/10 text-white bg-transparent rounded-[9px]";
      break;
    case 'ghost':
      variantStyle = "text-mutedText hover:text-white hover:bg-cardSurface rounded-[9px]";
      break;
  }

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      className={`${baseStyle} ${variantStyle} ${widthStyle} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2.5 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
};
