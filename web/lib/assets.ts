export interface Asset {
  id: number;
  code: string;
  name: string;
  iconSymbol: string;
  iconBgColor: string;
  iconTextColor: string;
}

export const ASSETS: Asset[] = [
  {
    id: 0,
    code: 'USDC',
    name: 'USD Coin',
    iconSymbol: '$',
    iconBgColor: 'bg-[#2775CA]',
    iconTextColor: 'text-white',
  },
  {
    id: 1,
    code: 'EURC',
    name: 'Euro Coin',
    iconSymbol: '€',
    iconBgColor: 'bg-[#1A365D]',
    iconTextColor: 'text-purple-300',
  },
  {
    id: 2,
    code: 'MGUSD',
    name: 'MG USD',
    iconSymbol: 'M',
    iconBgColor: 'bg-[#E53E3E]',
    iconTextColor: 'text-white',
  },
  {
    id: 3,
    code: 'YLDS',
    name: 'Yield Stellar',
    iconSymbol: 'Y',
    iconBgColor: 'bg-[#D69E2E]',
    iconTextColor: 'text-white',
  },
  {
    id: 4,
    code: 'XLM',
    name: 'Stellar Lumens',
    iconSymbol: 'X',
    iconBgColor: 'bg-[#000000]',
    iconTextColor: 'text-[#14b8a6]',
  },
];

export function getAssetById(id: number): Asset | undefined {
  return ASSETS.find(a => a.id === id);
}

export function getAssetByCode(code: string): Asset | undefined {
  return ASSETS.find(a => a.code === code);
}
