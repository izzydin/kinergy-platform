import React from 'react';
import { Dumbbell, Activity, UtensilsCrossed, CupSoda, DoorClosed } from 'lucide-react';
import type { PosCategory } from './pos-types';
import { useTranslation } from '../../../../app/providers/locale-provider';

export interface PosCategorySelectorProps {
  selectedCategory: PosCategory;
  onSelectCategory: (category: PosCategory) => void;
  disabled?: boolean;
}

interface CategoryOption {
  id: PosCategory;
  labelKey: string;
  label: string;
  sublabelKey: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: 'GYM_MEMBERSHIP',
    labelKey: 'sales.categoryGymMemberships',
    label: 'Gym Memberships',
    sublabelKey: 'sales.categoryGymSublabel',
    sublabel: 'Plans & Passes',
    icon: Dumbbell,
    colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'KINESIOLOGY',
    labelKey: 'sales.categoryKinesiology',
    label: 'Kinesiology',
    sublabelKey: 'sales.categoryKinesiologySublabel',
    sublabel: 'Therapy Sessions',
    icon: Activity,
    colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'FOOD',
    labelKey: 'sales.categoryFood',
    label: 'Food & Meals',
    sublabelKey: 'sales.categoryFoodSublabel',
    sublabel: 'Healthy Kitchen',
    icon: UtensilsCrossed,
    colorClass: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  },
  {
    id: 'DRINKS_PRODUCTS',
    labelKey: 'sales.categoryDrinksProducts',
    label: 'Drinks & Products',
    sublabelKey: 'sales.categoryDrinksSublabel',
    sublabel: 'Beverages & Retail',
    icon: CupSoda,
    colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'ROOM_RENTAL',
    labelKey: 'sales.categoryRoomRentals',
    label: 'Room Rentals',
    sublabelKey: 'sales.categoryRoomSublabel',
    sublabel: 'Facility Spaces',
    icon: DoorClosed,
    colorClass: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
];

export const PosCategorySelector: React.FC<PosCategorySelectorProps> = ({
  selectedCategory,
  onSelectCategory,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-5 gap-2"
      role="tablist"
      aria-label="Purchase Categories"
      data-testid="pos-category-selector"
    >
      {CATEGORIES.map((cat) => {
        const isSelected = selectedCategory === cat.id;
        const Icon = cat.icon;

        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={disabled}
            onClick={() => onSelectCategory(cat.id)}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
              isSelected
                ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            data-testid={`pos-category-tab-${cat.id.toLowerCase()}`}
          >
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center mb-1.5 ${
                isSelected ? 'bg-primary text-primary-foreground' : cat.colorClass
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold leading-tight">
              {t(cat.labelKey, cat.label)}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {t(cat.sublabelKey, cat.sublabel)}
            </span>
          </button>
        );
      })}
    </div>
  );
};
