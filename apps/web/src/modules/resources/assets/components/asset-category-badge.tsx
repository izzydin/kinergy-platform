import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { AssetCategory } from '../types';
import { cn } from '../../../../shared/lib/utils';

export interface AssetCategoryBadgeProps {
  category: AssetCategory;
  className?: string;
}

const CATEGORY_DISPLAY_NAMES: Record<AssetCategory, string> = {
  [AssetCategory.GYM_EQUIPMENT]: 'Gym Equipment',
  [AssetCategory.THERAPY_EQUIPMENT]: 'Therapy Equipment',
  [AssetCategory.KITCHEN_EQUIPMENT]: 'Kitchen Equipment',
  [AssetCategory.OFFICE_FURNITURE]: 'Office Furniture',
  [AssetCategory.ELECTRONICS]: 'Electronics',
  [AssetCategory.CLEANING_EQUIPMENT]: 'Cleaning Equipment',
};

export const AssetCategoryBadge: React.FC<AssetCategoryBadgeProps> = ({ category, className }) => {
  const displayName = CATEGORY_DISPLAY_NAMES[category] || category;

  return (
    <Badge
      variant="secondary"
      className={cn('bg-muted text-muted-foreground font-normal text-xs', className)}
    >
      {displayName}
    </Badge>
  );
};
