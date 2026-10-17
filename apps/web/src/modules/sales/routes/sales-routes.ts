/**
 * Canonical route definitions and URL builders for the Sales & Payments module.
 * Centralizes routing paths to prevent scattered hardcoded strings.
 */
export const SALES_ROUTES = {
  overview: () => '/sales/overview',
  list: () => '/sales/list',
  create: () => '/sales/new',
  detail: (saleId: string) => `/sales/${encodeURIComponent(saleId)}`,
  receipt: (saleId: string) => `/sales/${encodeURIComponent(saleId)}/receipt`,
  payments: () => '/sales/payments',
  paymentDetail: (paymentId: string) => `/sales/payments/${encodeURIComponent(paymentId)}`,
} as const;
