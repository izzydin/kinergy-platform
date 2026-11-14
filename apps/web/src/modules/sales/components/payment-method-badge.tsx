import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import type { PaymentMethod } from '../types/payments.types';
import { useTranslation } from '../../../app/providers/locale-provider';

export interface PaymentMethodBadgeProps {
  method: PaymentMethod;
  className?: string;
}

export const PaymentMethodBadge: React.FC<PaymentMethodBadgeProps> = ({ method, className }) => {
  const { t, locale } = useTranslation();

  const formatLabel = (val: string) =>
    val
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const fallback = formatLabel(method);

  return (
    <Badge variant="outline" className={`font-mono text-xs ${className ?? ''}`}>
      {locale === 'es' ? t(method, fallback) : fallback}
    </Badge>
  );
};
