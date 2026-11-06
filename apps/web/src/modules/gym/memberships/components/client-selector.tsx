import React, { useState, useEffect, useRef, useId } from 'react';
import { Badge, Button, Input, Spinner } from '@kinergy-platform/ui';
import { Search, X, Check, AlertCircle } from 'lucide-react';
import { useClientList, useClientDetail } from '../../../client/hooks/use-client-queries';
import type { ClientModel } from '../../../client/types/client.types';

export interface ClientSelectorProps {
  /** The selected client ID (authoritative backend identifier) */
  value?: string;
  /** Callback fired when client is selected or cleared */
  onChange: (clientId: string, client?: ClientModel | null) => void;
  /** Callback fired when focus leaves the component */
  onBlur?: () => void;
  /** Whether the selector is disabled (e.g. form is submitting) */
  disabled?: boolean;
  /** DOM ID for the input element */
  id?: string;
  /** DOM Name for the input element */
  name?: string;
  /** Placeholder for the search input */
  placeholder?: string;
  /** Auto-focus the search input upon mount */
  autoFocus?: boolean;
  /** Optional custom test identifier */
  'data-testid'?: string;
}

/**
 * ClientSelector Component
 *
 * Searchable, accessible combobox allowing reception staff to locate and select
 * registered active clients by full name, phone number, or client code (referenceNumber).
 *
 * WCAG 2.1 AA Combobox pattern with keyboard navigation, live search debouncing,
 * and clear visual distinction of selected client data.
 */
export const ClientSelector: React.FC<ClientSelectorProps> = ({
  value,
  onChange,
  onBlur,
  disabled = false,
  id,
  name,
  placeholder = 'Search by client name, phone number, or client code...',
  autoFocus = false,
  'data-testid': testId = 'client-selector',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [selectedClient, setSelectedClient] = useState<ClientModel | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Debounce search query to avoid excessive API requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load client details if initial value is provided without selected client object
  const shouldFetchDetail = Boolean(value && (!selectedClient || selectedClient.id !== value));
  const { data: clientDetailData } = useClientDetail(value, {
    enabled: shouldFetchDetail,
  });

  useEffect(() => {
    if (clientDetailData && clientDetailData.id === value) {
      setSelectedClient(clientDetailData);
    }
  }, [clientDetailData, value]);

  // Sync state if value is cleared externally
  useEffect(() => {
    if (!value) {
      setSelectedClient(null);
    }
  }, [value]);

  // Query active clients matching debounced search term
  const {
    data: clientsData,
    isLoading: isLoadingClients,
    isFetching: isFetchingClients,
    error: clientsError,
  } = useClientList(
    {
      query: debouncedQuery || undefined,
      status: 'ACTIVE',
      limit: 10,
    },
    {
      enabled: isOpen && !selectedClient && !disabled,
    },
  );

  const clientItems = clientsData?.items ?? [];

  // Reset keyboard highlight index when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [clientItems]);

  // Handle outside click to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onBlur]);

  const handleSelect = (client: ClientModel) => {
    setSelectedClient(client);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange(client.id, client);
  };

  const handleClear = () => {
    setSelectedClient(null);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    onChange('', null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      if (clientItems.length > 0) {
        setHighlightedIndex((prev) => (prev < clientItems.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(clientItems.length - 1);
        return;
      }
      if (clientItems.length > 0) {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : clientItems.length - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < clientItems.length) {
        e.preventDefault();
        const candidate = clientItems[highlightedIndex];
        if (candidate) {
          handleSelect(candidate);
        }
      } else if (isOpen && clientItems.length === 1 && debouncedQuery.length >= 2) {
        e.preventDefault();
        const candidate = clientItems[0];
        if (candidate) {
          handleSelect(candidate);
        }
      }
    }
  };

  const isBusy = isLoadingClients || isFetchingClients;

  // Selected State Presentation
  if (value) {
    const displayName =
      selectedClient?.fullName ||
      (selectedClient?.firstName
        ? `${selectedClient.firstName} ${selectedClient.lastName}`.trim()
        : value);

    const clientCode = selectedClient?.referenceNumber;
    const phone = selectedClient?.phone;
    const email = selectedClient?.email;

    const initials = (
      selectedClient?.firstName && selectedClient?.lastName
        ? `${selectedClient.firstName[0]}${selectedClient.lastName[0]}`
        : displayName.slice(0, 2)
    ).toUpperCase();

    return (
      <div className="space-y-1.5" data-testid={testId}>
        {/* Visually hidden input for form value synchronization and backwards test compatibility */}
        <input
          type="text"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          id={id}
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw) {
              onChange(raw, null);
            } else {
              handleClear();
            }
          }}
          data-testid="input-client-id"
        />

        <div
          className="flex items-center justify-between p-3 rounded-lg border border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-xs transition-colors"
          data-testid="selected-client-card"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold text-xs uppercase flex items-center justify-center shrink-0 border border-primary/30">
              {initials}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-foreground truncate">
                  {displayName}
                </span>
                <Badge
                  variant="outline"
                  size="sm"
                  className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0"
                >
                  ACTIVE
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground font-mono flex items-center flex-wrap gap-x-2">
                {clientCode && <span>{clientCode}</span>}
                {clientCode && phone && <span>·</span>}
                {phone && <span>{phone}</span>}
                {(clientCode || phone) && email && <span>·</span>}
                {email && <span className="truncate max-w-[220px]">{email}</span>}
                {!clientCode && !phone && !email && <span>ID: {value}</span>}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="text-xs h-8 px-3 shrink-0 ml-3"
            data-testid="change-client-button"
          >
            Change Client
          </Button>
        </div>
      </div>
    );
  }

  // Unselected Search Combobox Presentation
  return (
    <div ref={containerRef} className="relative w-full space-y-1.5" data-testid={testId}>
      {/* Visually hidden input for form value synchronization and backwards test compatibility */}
      <input
        type="text"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        id={id}
        value=""
        onChange={(e) => {
          const raw = e.target.value;
          if (raw) {
            onChange(raw, null);
          }
        }}
        data-testid="input-client-id"
      />

      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus={autoFocus}
          className="pr-16 text-sm h-10 w-full"
          data-testid="client-search-input"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightedIndex >= 0 && clientItems[highlightedIndex]
              ? `client-option-${clientItems[highlightedIndex].id}`
              : undefined
          }
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1.5 text-muted-foreground pointer-events-none">
          {isBusy && <Spinner size="sm" data-testid="client-search-loading-spinner" />}
          {searchTerm && !isBusy && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground text-xs p-1 pointer-events-auto"
              aria-label="Clear search input"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {!searchTerm && !isBusy && <Search className="h-4 w-4" />}
        </div>
      </div>

      {/* Autocomplete Dropdown Listbox */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Matching clients"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-64 overflow-y-auto"
          data-testid="client-search-dropdown"
        >
          {isLoadingClients ? (
            <div
              className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center space-x-2"
              data-testid="client-search-loading"
            >
              <Spinner size="sm" />
              <span>Searching client registry...</span>
            </div>
          ) : clientsError ? (
            <div
              className="p-3 text-xs text-destructive flex items-center space-x-2 bg-destructive/10"
              data-testid="client-search-error"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Failed to search clients: {clientsError.message}</span>
            </div>
          ) : clientItems.length > 0 ? (
            <div className="py-1 divide-y divide-border/40">
              {clientItems.map((client, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const clientName =
                  client.fullName ||
                  `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() ||
                  client.id;
                const secondaryInfo = [client.referenceNumber, client.phone, client.email]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <button
                    key={client.id}
                    id={`client-option-${client.id}`}
                    role="option"
                    aria-selected={isHighlighted}
                    type="button"
                    onClick={() => handleSelect(client)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                      isHighlighted
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'hover:bg-accent/50'
                    }`}
                    data-testid={`client-search-item-${client.id}`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-sm text-foreground truncate">
                        {clientName}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        {secondaryInfo || client.id}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <Badge
                        variant="secondary"
                        size="sm"
                        className="text-[10px] uppercase font-mono"
                      >
                        {client.status}
                      </Badge>
                      {isHighlighted && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="p-4 text-center text-xs text-muted-foreground"
              data-testid="client-search-empty"
            >
              {debouncedQuery.trim()
                ? `No clients found matching "${debouncedQuery}"`
                : 'Type a name, phone number, or client code to search.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
