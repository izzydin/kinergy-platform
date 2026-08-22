import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { AccessResult, AttendanceItemDTO } from '../types';

interface TrainerCheckInRowProps {
  readonly item: AttendanceItemDTO;
  readonly onSelectClient?: (clientId: string) => void;
}

export const TrainerCheckInRow: React.FC<TrainerCheckInRowProps> = ({ item, onSelectClient }) => {
  const getResultBadge = (result: AccessResult) => {
    switch (result) {
      case AccessResult.GRANTED:
        return (
          <Badge
            variant="default"
            className="bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 font-medium"
          >
            ✓ GRANTED
          </Badge>
        );
      case AccessResult.DENIED_DUPLICATE_CHECKIN:
        return (
          <Badge
            variant="secondary"
            className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 font-medium"
          >
            DUPLICATE
          </Badge>
        );
      case AccessResult.DENIED_EXPIRED:
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-medium">
            DENIED (EXPIRED)
          </Badge>
        );
      case AccessResult.DENIED_FROZEN:
        return (
          <Badge
            variant="secondary"
            className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-[10px] px-2 py-0.5 font-medium"
          >
            DENIED (FROZEN)
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-medium">
            {result.replace('DENIED_', 'DENIED: ')}
          </Badge>
        );
    }
  };

  return (
    <tr
      className="hover:bg-muted/30 transition-colors border-b border-border/40 cursor-pointer text-xs"
      onClick={() => onSelectClient?.(item.clientId)}
      data-testid={`trainer-check-in-row-${item.id}`}
    >
      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap font-mono">
        {new Date(item.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="py-2.5 px-3 font-semibold text-primary font-mono">{item.clientId}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{item.method}</td>
      <td className="py-2.5 px-3">{getResultBadge(item.result)}</td>
      <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate" title={item.notes ?? ''}>
        {item.notes ?? '-'}
      </td>
    </tr>
  );
};
