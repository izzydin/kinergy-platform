import React, { useState, useMemo } from 'react';
import { Card, CardContent, Button, Input, Badge, Spinner } from '@kinergy-platform/ui';
import { Search, Plus, Activity, AlertCircle, Clock } from 'lucide-react';
import type { PosCategory, PosCartItem } from './pos-types';
import { usePlans } from '../../../gym/plans/hooks/use-plans';
import { useClientTreatmentHistory } from '../../../kinesiology/hooks/use-client-treatment-history';
import { useInventoryList } from '../../../resources/inventory/hooks/use-inventory-queries';
import { useRoomsList } from '../../../scheduling/hooks/use-scheduling-queries';
import { toCents } from '../../utils/financial-math';
import {
  InventoryCategory,
  InventoryItemStatus,
} from '../../../resources/inventory/types/inventory.types';
import { SessionStatus } from '@kinergy-platform/core';
import { useAuth } from '../../../../app/providers/auth-provider';

export interface PosItemBrowserProps {
  selectedCategory: PosCategory;
  selectedClientId?: string;
  selectedClientName?: string;
  isWalkIn: boolean;
  onAddToCart: (item: Omit<PosCartItem, 'id'>) => void;
  disabled?: boolean;
}

export const PosItemBrowser: React.FC<PosItemBrowserProps> = ({
  selectedCategory,
  selectedClientId,
  selectedClientName,
  isWalkIn,
  onAddToCart,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [drinkSubcategory, setDrinkSubcategory] = useState<string>('ALL');
  const [roomHours, setRoomHours] = useState<Record<string, number>>({});

  let canReadInventory = true;
  try {
    const auth = useAuth();
    if (auth && (typeof auth.hasPermission === 'function' || auth.currentUser)) {
      canReadInventory = Boolean(
        typeof auth.hasPermission === 'function'
          ? auth.hasPermission('inventory.read')
          : auth.currentUser?.permissions?.includes('inventory.read'),
      );
    }
  } catch {
    canReadInventory = true;
  }

  // 1. Gym Plans Query
  const {
    data: plansData,
    isLoading: isLoadingPlans,
    error: plansError,
  } = usePlans({ status: 'ACTIVE' });

  // 2. Kinesiology Treatment History Query
  const {
    data: kinesiologyData,
    isLoading: isLoadingKinesiology,
    error: kinesiologyError,
  } = useClientTreatmentHistory(selectedClientId, { status: SessionStatus.COMPLETED });

  // 3. Inventory Query (Food & Retail)
  const {
    data: inventoryData,
    isLoading: isLoadingInventory,
    error: inventoryError,
  } = useInventoryList({ status: InventoryItemStatus.ACTIVE }, { enabled: canReadInventory });

  // 4. Rooms Query
  const {
    data: roomsData,
    isLoading: isLoadingRooms,
    error: roomsError,
  } = useRoomsList({ status: 'AVAILABLE' });

  // Filtered Gym Plans
  const filteredPlans = useMemo(() => {
    const items = plansData?.items || [];
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [plansData, searchTerm]);

  // Filtered Food Items
  const filteredFood = useMemo(() => {
    const allItems = inventoryData?.items || [];
    const foodItems = allItems.filter((item) => item.category === InventoryCategory.HEALTHY_MEALS);
    if (!searchTerm.trim()) return foodItems;
    const q = searchTerm.toLowerCase();
    return foodItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q),
    );
  }, [inventoryData, searchTerm]);

  // Filtered Drinks & Retail Products
  const filteredDrinksAndProducts = useMemo(() => {
    const allItems = inventoryData?.items || [];
    const retailItems = allItems.filter((item) => {
      if (item.category === InventoryCategory.HEALTHY_MEALS) return false;
      if (drinkSubcategory === 'DRINKS') return item.category === InventoryCategory.HEALTHY_DRINKS;
      if (drinkSubcategory === 'SUPPLEMENTS')
        return item.category === InventoryCategory.SUPPLEMENTS;
      if (drinkSubcategory === 'RETAIL')
        return (
          item.category === InventoryCategory.RETAIL_PRODUCTS ||
          item.category === InventoryCategory.THERAPY_CONSUMABLES
        );
      return (
        item.category === InventoryCategory.HEALTHY_DRINKS ||
        item.category === InventoryCategory.SUPPLEMENTS ||
        item.category === InventoryCategory.RETAIL_PRODUCTS ||
        item.category === InventoryCategory.THERAPY_CONSUMABLES
      );
    });

    if (!searchTerm.trim()) return retailItems;
    const q = searchTerm.toLowerCase();
    return retailItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q),
    );
  }, [inventoryData, searchTerm, drinkSubcategory]);

  // Filtered Kinesiology Sessions
  const completedSessions = useMemo(() => {
    const items = kinesiologyData?.items || [];
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(
      (s) =>
        (s.sessionId && s.sessionId.toLowerCase().includes(q)) ||
        (s.therapistId && s.therapistId.toLowerCase().includes(q)),
    );
  }, [kinesiologyData, searchTerm]);

  // Filtered Rooms
  const filteredRooms = useMemo(() => {
    const items = roomsData || [];
    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase();
    return items.filter((r) => r.name.toLowerCase().includes(q));
  }, [roomsData, searchTerm]);

  return (
    <Card className="border-border bg-card" data-testid="pos-item-browser">
      <CardContent className="p-4 space-y-4">
        {/* Search & Sub-category Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`Search ${
                selectedCategory === 'GYM_MEMBERSHIP'
                  ? 'membership plans...'
                  : selectedCategory === 'FOOD'
                    ? 'meals & dishes...'
                    : selectedCategory === 'DRINKS_PRODUCTS'
                      ? 'beverages & retail...'
                      : selectedCategory === 'KINESIOLOGY'
                        ? 'sessions...'
                        : 'rooms...'
              }`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="pos-item-search-input"
            />
          </div>

          {selectedCategory === 'DRINKS_PRODUCTS' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(['ALL', 'DRINKS', 'SUPPLEMENTS', 'RETAIL'] as const).map((sub) => (
                <Button
                  key={sub}
                  type="button"
                  variant={drinkSubcategory === sub ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDrinkSubcategory(sub)}
                  className="h-7 text-[11px] px-2 py-0 shrink-0"
                >
                  {sub === 'ALL'
                    ? 'All'
                    : sub === 'DRINKS'
                      ? 'Drinks'
                      : sub === 'SUPPLEMENTS'
                        ? 'Supplements'
                        : 'Retail'}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* 1. GYM MEMBERSHIPS */}
        {selectedCategory === 'GYM_MEMBERSHIP' && (
          <div className="space-y-3" data-testid="pos-browser-gym">
            {isLoadingPlans ? (
              <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Spinner className="h-4 w-4" /> Loading active membership plans...
              </div>
            ) : plansError ? (
              <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                Failed to load membership plans: {plansError.message}
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No active membership plans found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredPlans.map((plan) => {
                  const priceCents = toCents(plan.priceAmount);
                  return (
                    <div
                      key={plan.id}
                      className="p-3.5 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors flex flex-col justify-between space-y-2.5"
                      data-testid={`pos-plan-card-${plan.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {plan.code}
                          </Badge>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            ${plan.priceAmount.toFixed(2)} {plan.priceCurrency || 'USD'}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-foreground leading-tight">
                          {plan.name}
                        </h4>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {plan.durationInDays} days access ·{' '}
                          {plan.visitQuota ? `${plan.visitQuota} visits` : 'Unlimited visits'}
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                          onAddToCart({
                            sourceType: 'MEMBERSHIP_PLAN',
                            sourceId: plan.id,
                            skuOrCode: plan.code,
                            category: 'GYM_MEMBERSHIP',
                            name: `Gym Membership - ${plan.name}`,
                            description: `${plan.durationInDays} days pass`,
                            unitPriceCents: priceCents,
                            unitPriceAmount: plan.priceAmount,
                            quantity: 1,
                            metadata: {
                              planDurationDays: plan.durationInDays,
                            },
                          })
                        }
                        className="w-full h-8 text-xs gap-1"
                        data-testid={`add-plan-btn-${plan.id}`}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add to Cart
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. KINESIOLOGY SESSIONS */}
        {selectedCategory === 'KINESIOLOGY' && (
          <div className="space-y-3" data-testid="pos-browser-kinesiology">
            {!selectedClientId ? (
              <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {isWalkIn
                      ? 'Walk-in Guests Cannot Bill Clinical Sessions'
                      : 'Registered Client Required for Therapy Sessions'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    In accordance with clinical billing rules, only completed treatment sessions
                    belonging to an identified patient can be billed. Please select a registered
                    client above.
                  </p>
                </div>
              </div>
            ) : isLoadingKinesiology ? (
              <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Spinner className="h-4 w-4" /> Loading completed clinical sessions for{' '}
                {selectedClientName || 'client'}...
              </div>
            ) : kinesiologyError ? (
              <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                Failed to load clinical encounters: {kinesiologyError.message}
              </div>
            ) : completedSessions.length === 0 ? (
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center space-y-1.5 py-6">
                <Activity className="h-6 w-6 text-muted-foreground mx-auto" />
                <p className="text-xs font-semibold text-foreground">
                  No Billable Clinical Sessions Found
                </p>
                <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                  Client has no completed therapy sessions awaiting commercial checkout. A session
                  must be conducted and completed by the therapist in the Kinesiology Workspace
                  before billing.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {completedSessions.map((session) => {
                  const feeAmount = 85.0; // standard clinical treatment rate
                  const feeCents = 8500;
                  return (
                    <div
                      key={session.sessionId}
                      className="p-3.5 rounded-lg border border-border bg-card hover:border-emerald-500/50 transition-colors flex flex-col justify-between space-y-2.5"
                      data-testid={`pos-session-card-${session.sessionId}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          >
                            COMPLETED
                          </Badge>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            ${feeAmount.toFixed(2)} USD
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Clinical Treatment Encounter
                        </h4>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>
                            Session ID: <span className="font-mono">{session.sessionId}</span>
                          </p>
                          <p>Therapist: {session.therapistId}</p>
                          <p>Encounter Date: {new Date(session.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                          onAddToCart({
                            sourceType: 'TREATMENT_SESSION',
                            sourceId: session.sessionId,
                            skuOrCode: session.appointmentId || session.sessionId,
                            category: 'KINESIOLOGY',
                            name: `Clinical Kinesiology Session (${session.therapistId})`,
                            description: `Session ${session.sessionId}`,
                            unitPriceCents: feeCents,
                            unitPriceAmount: feeAmount,
                            quantity: 1,
                            metadata: {
                              therapistId: session.therapistId,
                              appointmentDate: session.createdAt,
                            },
                          })
                        }
                        className="w-full h-8 text-xs gap-1"
                        data-testid={`add-session-btn-${session.sessionId}`}
                      >
                        <Plus className="h-3.5 w-3.5" /> Bill Session
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. FOOD & MEALS */}
        {selectedCategory === 'FOOD' && (
          <div className="space-y-3" data-testid="pos-browser-food">
            {!canReadInventory ? (
              <div
                className="p-4 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-md border border-amber-200 dark:border-amber-800/50 flex items-center gap-2"
                data-testid="pos-food-permission-notice"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  You do not possess permission (<code>inventory.read</code>) to browse or sell
                  kitchen food items.
                </span>
              </div>
            ) : isLoadingInventory ? (
              <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Spinner className="h-4 w-4" /> Loading kitchen food catalog...
              </div>
            ) : inventoryError ? (
              <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                Failed to load kitchen inventory: {inventoryError.message}
              </div>
            ) : filteredFood.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No active food products found matching your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredFood.map((item) => {
                  const hasValidPrice =
                    item.sellingPrice !== undefined &&
                    item.sellingPrice !== null &&
                    typeof item.sellingPrice.amount === 'number' &&
                    item.sellingPrice.amount > 0 &&
                    !Number.isNaN(item.sellingPrice.amount);
                  const priceAmount = hasValidPrice ? item.sellingPrice.amount : 0;
                  const priceCents = hasValidPrice ? toCents(item.sellingPrice) : 0;
                  const isOutOfStock = item.currentStock <= 0 || item.isOutOfStock;

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-lg border transition-colors flex flex-col justify-between space-y-2.5 ${
                        isOutOfStock || !hasValidPrice
                          ? 'border-border bg-muted/30 opacity-70'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                      data-testid={`pos-food-card-${item.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {item.sku}
                          </Badge>
                          {hasValidPrice ? (
                            <span
                              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono"
                              data-testid={`pos-food-price-${item.id}`}
                            >
                              ${priceAmount.toFixed(2)} {item.sellingPrice?.currency || 'USD'}
                            </span>
                          ) : (
                            <span
                              className="text-[11px] font-semibold text-destructive font-mono"
                              data-testid={`pos-food-price-error-${item.id}`}
                            >
                              No Price
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-foreground leading-tight">
                          {item.name}
                        </h4>
                        {!hasValidPrice && (
                          <p className="text-[11px] text-destructive flex items-start gap-1 mt-1 leading-snug">
                            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>
                              This product does not have a valid selling price configured. Please
                              contact an administrator.
                            </span>
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            {item.unitOfMeasure || 'portion'}
                          </span>
                          <span
                            className={
                              isOutOfStock
                                ? 'text-destructive font-semibold'
                                : 'text-muted-foreground'
                            }
                          >
                            {isOutOfStock ? 'Out of stock' : `${item.currentStock} in stock`}
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled || isOutOfStock || !hasValidPrice}
                        onClick={() =>
                          onAddToCart({
                            sourceType: 'INVENTORY_ITEM',
                            sourceId: item.id,
                            skuOrCode: item.sku,
                            category: 'FOOD',
                            name: item.name,
                            description: item.description || undefined,
                            unitPriceCents: priceCents,
                            unitPriceAmount: priceAmount,
                            quantity: 1,
                            maxStock: item.currentStock,
                          })
                        }
                        className="w-full h-8 text-xs gap-1"
                        data-testid={`add-food-btn-${item.id}`}
                      >
                        <Plus className="h-3.5 w-3.5" />{' '}
                        {!hasValidPrice
                          ? 'Unpriced'
                          : isOutOfStock
                            ? 'Out of Stock'
                            : 'Add to Cart'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 4. DRINKS & PRODUCTS */}
        {selectedCategory === 'DRINKS_PRODUCTS' && (
          <div className="space-y-3" data-testid="pos-browser-drinks">
            {!canReadInventory ? (
              <div
                className="p-4 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-md border border-amber-200 dark:border-amber-800/50 flex items-center gap-2"
                data-testid="pos-drinks-permission-notice"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  You do not possess permission (<code>inventory.read</code>) to browse or sell
                  beverages and retail products.
                </span>
              </div>
            ) : isLoadingInventory ? (
              <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Spinner className="h-4 w-4" /> Loading beverage and retail catalog...
              </div>
            ) : inventoryError ? (
              <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                Failed to load products: {inventoryError.message}
              </div>
            ) : filteredDrinksAndProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No retail products found matching your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredDrinksAndProducts.map((item) => {
                  const hasValidPrice =
                    item.sellingPrice !== undefined &&
                    item.sellingPrice !== null &&
                    typeof item.sellingPrice.amount === 'number' &&
                    item.sellingPrice.amount > 0 &&
                    !Number.isNaN(item.sellingPrice.amount);
                  const priceAmount = hasValidPrice ? item.sellingPrice.amount : 0;
                  const priceCents = hasValidPrice ? toCents(item.sellingPrice) : 0;
                  const isOutOfStock = item.currentStock <= 0 || item.isOutOfStock;

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-lg border transition-colors flex flex-col justify-between space-y-2.5 ${
                        isOutOfStock || !hasValidPrice
                          ? 'border-border bg-muted/30 opacity-70'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                      data-testid={`pos-drink-card-${item.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {item.sku}
                          </Badge>
                          {hasValidPrice ? (
                            <span
                              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono"
                              data-testid={`pos-drink-price-${item.id}`}
                            >
                              ${priceAmount.toFixed(2)} {item.sellingPrice?.currency || 'USD'}
                            </span>
                          ) : (
                            <span
                              className="text-[11px] font-semibold text-destructive font-mono"
                              data-testid={`pos-drink-price-error-${item.id}`}
                            >
                              No Price
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-foreground leading-tight">
                          {item.name}
                        </h4>
                        {!hasValidPrice && (
                          <p className="text-[11px] text-destructive flex items-start gap-1 mt-1 leading-snug">
                            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>
                              This product does not have a valid selling price configured. Please
                              contact an administrator.
                            </span>
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            {item.category.replace(/_/g, ' ')}
                          </span>
                          <span
                            className={
                              isOutOfStock
                                ? 'text-destructive font-semibold'
                                : 'text-muted-foreground'
                            }
                          >
                            {isOutOfStock ? 'Out of stock' : `${item.currentStock} in stock`}
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled || isOutOfStock || !hasValidPrice}
                        onClick={() =>
                          onAddToCart({
                            sourceType: 'INVENTORY_ITEM',
                            sourceId: item.id,
                            skuOrCode: item.sku,
                            category: 'DRINKS_PRODUCTS',
                            name: item.name,
                            description: item.description || undefined,
                            unitPriceCents: priceCents,
                            unitPriceAmount: priceAmount,
                            quantity: 1,
                            maxStock: item.currentStock,
                          })
                        }
                        className="w-full h-8 text-xs gap-1"
                        data-testid={`add-drink-btn-${item.id}`}
                      >
                        <Plus className="h-3.5 w-3.5" />{' '}
                        {!hasValidPrice
                          ? 'Unpriced'
                          : isOutOfStock
                            ? 'Out of Stock'
                            : 'Add to Cart'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 5. ROOM RENTALS */}
        {selectedCategory === 'ROOM_RENTAL' && (
          <div className="space-y-3" data-testid="pos-browser-rooms">
            {isLoadingRooms ? (
              <div className="py-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Spinner className="h-4 w-4" /> Loading facility rooms...
              </div>
            ) : roomsError ? (
              <div className="p-3 text-xs text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                Failed to load rooms: {roomsError.message}
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No available facility rooms found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredRooms.map((room) => {
                  const hours = roomHours[room.id] ?? 1;
                  const hourlyRateAmount = 60.0; // standard hourly rate $60.00
                  const hourlyRateCents = 6000;

                  return (
                    <div
                      key={room.id}
                      className="p-3.5 rounded-lg border border-border bg-card hover:border-purple-500/50 transition-colors flex flex-col justify-between space-y-3"
                      data-testid={`pos-room-card-${room.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="text-[10px] text-purple-600 dark:text-purple-400 border-purple-500/30"
                          >
                            AVAILABLE
                          </Badge>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            ${hourlyRateAmount.toFixed(2)} / hr
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">{room.name}</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Capacity: {room.capacity} people ·{' '}
                          {room.features && room.features.length > 0
                            ? room.features.join(', ')
                            : 'Standard facility room'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Duration:</span>
                          <select
                            value={hours}
                            onChange={(e) =>
                              setRoomHours({
                                ...roomHours,
                                [room.id]: Number(e.target.value),
                              })
                            }
                            className="h-7 text-xs rounded border border-input bg-background px-1.5 font-medium text-foreground"
                            data-testid={`room-hours-select-${room.id}`}
                          >
                            <option value={1}>1 hour</option>
                            <option value={2}>2 hours</option>
                            <option value={3}>3 hours</option>
                            <option value={4}>4 hours</option>
                          </select>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          disabled={disabled}
                          onClick={() =>
                            onAddToCart({
                              sourceType: 'CUSTOM_SERVICE',
                              sourceId: room.id,
                              skuOrCode: room.id,
                              category: 'ROOM_RENTAL',
                              name: `Room Rental - ${room.name}`,
                              description: `${hours} hr rental (Cap: ${room.capacity})`,
                              unitPriceCents: hourlyRateCents,
                              unitPriceAmount: hourlyRateAmount,
                              quantity: hours,
                              metadata: {
                                roomCapacity: room.capacity,
                              },
                            })
                          }
                          className="h-7 text-xs gap-1 px-3"
                          data-testid={`add-room-btn-${room.id}`}
                        >
                          <Plus className="h-3 w-3" /> Add ({hours}h)
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
