import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Badge } from '@kinergy-platform/ui';
import { Boxes, PackagePlus } from 'lucide-react';
import { HasPermission } from '../../../../app/routes/permission-guard';
import { InventoryOverviewSummary } from '../components/inventory-overview-summary';
import { LowStockAlertTable } from '../components/low-stock-alert-table';
import type { InventoryProductVM } from '../types';

export const InventoryOverviewPage: React.FC = () => {
  const navigate = useNavigate();

  const handleReceiveStock = (product: InventoryProductVM) => {
    navigate(`/resources/inventory/${product.id}?action=receive`);
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header Block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Inventory Overview
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Operational Hub
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time consumable stock balances, low-stock reorder alerts, and working capital
            valuation.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" size="sm">
            <Link to="/resources/inventory">
              <Boxes className="mr-1.5 h-4 w-4" /> Full Catalog
            </Link>
          </Button>
          <HasPermission name="inventory.write">
            <Button asChild variant="default" size="sm">
              <Link to="/resources/inventory/new">
                <PackagePlus className="mr-1.5 h-4 w-4" /> Register Product
              </Link>
            </Button>
          </HasPermission>
        </div>
      </div>

      {/* 2. Top-Level Operational KPI Cards */}
      <InventoryOverviewSummary />

      {/* 3. Low-Stock Reorder Priority Queue */}
      <LowStockAlertTable onReceiveStockClick={handleReceiveStock} />
    </div>
  );
};
