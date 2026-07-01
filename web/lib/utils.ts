export function formatCurrency(amount: string | number, asset: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) return amount.toString();
  
  // Format the number string without currency symbol first
  const formattedNum = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);

  switch (asset.toUpperCase()) {
    case 'USDC':
    case 'MGUSD':
    case 'YLDS':
      return `$${formattedNum}`;
    case 'EURC':
      return `€${formattedNum}`;
    default:
      return `${formattedNum} ${asset}`;
  }
}

export function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
