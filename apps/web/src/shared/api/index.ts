export {
  ApiError,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
  NetworkError,
  RequestCanceledError,
  normalizeApiError,
  normalizeQueryError,
} from './api-error';

export {
  HttpClient,
  httpClient,
  type AuthTokenGetter,
  type TenantIdGetter,
  type RequestOptions,
  type RequestInterceptor,
  type ResponseInterceptor,
} from './http-client';

export {
  useStandardMutation,
  type StandardMutationOptions,
  type OptimisticConfig,
  type MutationNotificationConfig,
  type NotificationMessageConfig,
} from './mutation-pipeline';
