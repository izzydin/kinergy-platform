import * as React from 'react';
import type { CrudListHeaderProps } from '../types/crud-list.types';
import { SlotInject } from '../../ui/slots/SlotInject';

export const CrudListHeader: React.FC<CrudListHeaderProps> = ({
  title,
  description,
  action,
  badge,
  slotTarget,
  className = '',
}) => {
  return (
    <>
      {slotTarget && action && <SlotInject target={slotTarget}>{action}</SlotInject>}
      <div
        className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
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
