import React from 'react';
import type { MoneyDTO } from '../types/sales.types';

export interface MoneyDisplayProps {
  value: MoneyDTO | number | null | undefined;
  currency?: string;
  className?: string;
  fractionDigits?: number;
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({
  value,
  currency = 'USD',
  className = '',
  fractionDigits = 2,
}) => {
  if (value === null || value === undefined) {
    return <span className={className}>—</span>;
  }

  if (typeof value === 'object' && value.formatted) {
    return <span className={`font-mono ${className}`}>{value.formatted}</span>;
  }

  const numericAmount = typeof value === 'object' ? value.amount : value;
  const targetCurrency = typeof value === 'object' ? value.currency : currency;

  const formattedString = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: targetCurrency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numericAmount);

  return <span className={`font-mono ${className}`}>{formattedString}</span>;
};
