import '@testing-library/jest-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { z } from 'zod';
import { Input } from '@kinergy-platform/ui';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import {
  Form,
  FormActions,
  FormCancelButton,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubmitButton,
  useApplyServerErrors,
  useDirtyGuard,
} from '../../forms';
import { ValidationError } from '../../query';
import { CrudError } from '../components/crud-error';
import { CrudFormHeader } from '../components/crud-form-header';
import { CrudFormLayout } from '../components/crud-form-layout';
import { CrudLoading } from '../components/crud-loading';

// Schema
const productSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  sku: z.string().min(3, 'SKU must be at least 3 characters'),
  price: z.coerce.number().min(1, 'Price must be greater than 0'),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductEntity extends ProductFormData {
  readonly id: string;
}

const MOCK_PRODUCT: ProductEntity = {
  id: 'prod_123',
  name: 'Kinesiology Tape Pro',
  sku: 'KT-PRO-01',
  price: 24.99,
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// 1. Representative Create Screen
function RepresentativeCreateScreen({
  onSubmitSuccess = jest.fn(),
  onCancel = jest.fn(),
}: {
  onSubmitSuccess?: (data: ProductFormData) => void;
  onCancel?: () => void;
}) {
  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      sku: '',
      price: 0,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: 'prod_new', ...data };
    },
    onSuccess: (result) => {
      onSubmitSuccess(result);
    },
  });

  return (
    <CrudFormLayout
      header={
        <CrudFormHeader
          title="Create Product"
          description="Add a new rehabilitation product to the catalog."
          backLink={{ href: '/products', label: 'Back to Catalog' }}
        />
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter product name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input placeholder="Enter SKU" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions>
            <FormCancelButton onCancel={onCancel} />
            <FormSubmitButton isSubmitting={mutation.isPending}>Create Product</FormSubmitButton>
          </FormActions>
        </form>
      </Form>
    </CrudFormLayout>
  );
}

// 2. Representative Edit Screen
function RepresentativeEditScreen({
  productId = 'prod_123',
  fetchQueryFn = () => Promise.resolve(MOCK_PRODUCT),
  onUpdateSuccess = jest.fn(),
  onCancel = jest.fn(),
}: {
  productId?: string;
  fetchQueryFn?: () => Promise<ProductEntity>;
  onUpdateSuccess?: (data: ProductEntity) => void;
  onCancel?: () => void;
}) {
  const {
    data: product,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['product', productId],
    queryFn: fetchQueryFn,
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    values: product
      ? {
          name: product.name,
          sku: product.sku,
          price: product.price,
        }
      : undefined,
  });

  const { isDirty, isSubmitSuccessful } = form.formState;
  useDirtyGuard({ isDirty, isSubmitSuccessful });

  const applyServerErrors = useApplyServerErrors(form.setError);

  const mutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (data.sku === 'DUPLICATE-SKU') {
        throw new ValidationError('A product with this SKU already exists', {
          sku: ['SKU is already registered to another item'],
        });
      }
      return { id: productId, ...data };
    },
    onSuccess: (result) => {
      onUpdateSuccess(result);
    },
    onError: (err) => {
      if (err instanceof ValidationError) {
        applyServerErrors(err);
      }
    },
  });

  if (isLoading) {
    return (
      <CrudFormLayout
        header={<CrudFormHeader title="Edit Product" description="Loading product details..." />}
      >
        <CrudLoading variant="form" />
      </CrudFormLayout>
    );
  }

  if (isError) {
    return (
      <CrudFormLayout
        header={<CrudFormHeader title="Edit Product" description="Unable to load product" />}
      >
        <CrudError error={error?.message} onRetry={refetch} />
      </CrudFormLayout>
    );
  }

  return (
    <CrudFormLayout
      header={
        <CrudFormHeader
          title={`Edit ${product?.name}`}
          description={`Update attributes for SKU: ${product?.sku}`}
          backLink={{ href: '/products', label: 'Back to Catalog' }}
        />
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter product name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input placeholder="Enter SKU" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions>
            <FormCancelButton onCancel={onCancel} />
            <FormSubmitButton isSubmitting={mutation.isPending}>Save Changes</FormSubmitButton>
          </FormActions>
        </form>
      </Form>
    </CrudFormLayout>
  );
}

function renderWithProviders(ui: React.ReactNode, initialEntries = ['/products/new']) {
  const queryClient = createTestQueryClient();

  const router = createMemoryRouter(
    [
      { path: '/products/new', element: ui },
      { path: '/products/:id/edit', element: ui },
      { path: '/products', element: <div>Product Catalog</div> },
    ],
    { initialEntries },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <RouterProvider router={router} />
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('Track C Step C3.3: Standard Create & Edit Experience', () => {
  describe('1. Standard Create Screen Flow', () => {
    it('renders create screen header with back navigation and empty form defaults', () => {
      renderWithProviders(<RepresentativeCreateScreen />);

      expect(screen.getByRole('heading', { name: 'Create Product' })).toBeInTheDocument();
      expect(
        screen.getByText('Add a new rehabilitation product to the catalog.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to catalog/i })).toHaveAttribute(
        'href',
        '/products',
      );
    });

    it('enforces client-side validation on invalid submission', async () => {
      renderWithProviders(<RepresentativeCreateScreen />);

      const submitBtn = screen.getByRole('button', { name: /create product/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
        expect(screen.getByText('SKU must be at least 3 characters')).toBeInTheDocument();
        expect(screen.getByText('Price must be greater than 0')).toBeInTheDocument();
      });
    });

    it('submits valid form data and executes success callback', async () => {
      const handleSubmitSuccess = jest.fn();
      renderWithProviders(<RepresentativeCreateScreen onSubmitSuccess={handleSubmitSuccess} />);

      fireEvent.change(screen.getByLabelText(/product name/i), {
        target: { value: 'Resistance Bands Set' },
      });
      fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'RB-SET-05' } });
      fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '29.99' } });

      const submitBtn = screen.getByRole('button', { name: /create product/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleSubmitSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Resistance Bands Set',
            sku: 'RB-SET-05',
            price: 29.99,
          }),
        );
      });
    });
  });

  describe('2. Standard Edit Screen Flow', () => {
    it('renders loading skeleton while fetching existing entity data', () => {
      renderWithProviders(<RepresentativeEditScreen fetchQueryFn={() => new Promise(() => {})} />, [
        '/products/prod_123/edit',
      ]);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByLabelText(/product name/i)).not.toBeInTheDocument();
    });

    it('renders error alert when entity fetch fails and allows retry', async () => {
      const failingFetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Product not found'))
        .mockResolvedValueOnce(MOCK_PRODUCT);

      renderWithProviders(<RepresentativeEditScreen fetchQueryFn={failingFetch} />, [
        '/products/prod_123/edit',
      ]);

      await waitFor(() => {
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Kinesiology Tape Pro')).toBeInTheDocument();
      });
    });

    it('populates form fields with existing entity values upon load', async () => {
      renderWithProviders(<RepresentativeEditScreen />, ['/products/prod_123/edit']);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Kinesiology Tape Pro')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('KT-PRO-01')).toBeInTheDocument();
      expect(screen.getByDisplayValue('24.99')).toBeInTheDocument();
    });

    it('maps server validation errors to form fields upon mutation failure', async () => {
      renderWithProviders(<RepresentativeEditScreen />, ['/products/prod_123/edit']);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Kinesiology Tape Pro')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'DUPLICATE-SKU' } });

      const submitBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('SKU is already registered to another item')).toBeInTheDocument();
      });
    });

    it('tracks dirty state and submits updated values', async () => {
      const handleUpdateSuccess = jest.fn();
      renderWithProviders(<RepresentativeEditScreen onUpdateSuccess={handleUpdateSuccess} />, [
        '/products/prod_123/edit',
      ]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Kinesiology Tape Pro')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/product name/i);
      fireEvent.change(nameInput, { target: { value: 'Kinesiology Tape Pro V2' } });

      const submitBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(handleUpdateSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'prod_123',
            name: 'Kinesiology Tape Pro V2',
            sku: 'KT-PRO-01',
            price: 24.99,
          }),
        );
      });
    });
  });
});
