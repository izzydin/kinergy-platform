import * as React from 'react';
import type { CrudListHeaderProps } from '../types/crud-list.types';
import { SlotInject } from '../../ui/slots/SlotInject';
import { useTranslation } from '../../../app/providers/locale-provider';

export const CrudListHeader: React.FC<CrudListHeaderProps> = ({
  title,
  description,
  action,
  badge,
  slotTarget,
  className = '',
}) => {
  const { locale, t } = useTranslation();
  const displayTitle = locale === 'es' && typeof title === 'string' ? t(title, title) : title;
  const displayDescription =
    locale === 'es' && typeof description === 'string' ? t(description, description) : description;

  return (
    <>
      {slotTarget && action && <SlotInject target={slotTarget}>{action}</SlotInject>}
      <div
        className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{displayTitle}</h1>
            {badge}
          </div>
          {displayDescription && (
            <p className="text-sm text-muted-foreground leading-relaxed">{displayDescription}</p>
          )}
        </div>

        {action && !slotTarget && (
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
            {action}
          </div>
        )}
      </div>
    </>
  );
};

CrudListHeader.displayName = 'CrudListHeader';
