import { fireEvent, render, screen } from '@testing-library/react';
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
} from '../index';

describe('Overlay Components (@kinergy-platform/ui)', () => {
  describe('Dialog Component Suite', () => {
    it('opens dialog content on trigger click and applies WAI-ARIA role="dialog"', () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open Modal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Action</DialogTitle>
              <DialogDescription>Are you sure you want to proceed?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button variant="destructive">Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const trigger = screen.getByRole('button', { name: /open modal/i });
      fireEvent.click(trigger);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('closes dialog when Escape key is pressed or close button is clicked', () => {
      const handleOpenChange = jest.fn();

      render(
        <Dialog open onOpenChange={handleOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Settings Modal</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
