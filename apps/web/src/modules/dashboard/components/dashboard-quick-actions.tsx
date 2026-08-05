import React from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kinergy-platform/ui';

export const DashboardQuickActions: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="default" size="sm">
            Quick System Check
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>System Diagnostic Verification</DialogTitle>
            <DialogDescription>
              Architectural validation dialog verifying presentational overlay integration, focus
              trapping, and modal portal behavior.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-muted-foreground text-sm">
            Status: All core subsystems operational. Micro-frontend boundary intact.
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close Diagnostic</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
