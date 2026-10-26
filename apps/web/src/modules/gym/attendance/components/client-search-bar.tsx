import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Badge, Spinner, Alert } from '@kinergy-platform/ui';
import { useClientSearch } from '../hooks/use-gym-attendance';
import { ClientSearchResultDTO, CheckInMethod } from '../types';
import { parseScanPayload } from '../utils/scan-parser';

interface ClientSearchBarProps {
  readonly selectedClient: ClientSearchResultDTO | null;
  readonly onSelectClient: (client: ClientSearchResultDTO, method?: CheckInMethod) => void;
  readonly onClearSelection: () => void;
  readonly autoFocus?: boolean;
}

export const ClientSearchBar: React.FC<ClientSearchBarProps> = ({
  selectedClient,
  onSelectClient,
  onClearSelection,
  autoFocus = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [scanError, setScanError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus management
  useEffect(() => {
    if (autoFocus && !selectedClient) {
      inputRef.current?.focus();
    }
  }, [autoFocus, selectedClient]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      // Don't search backend if query looks like raw JSON or URI scheme
      const trimmed = searchTerm.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('kinergy://')) {
        setDebouncedQuery(trimmed);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const {
    data: searchResults,
    isLoading,
    isFetching,
    error: searchError,
  } = useClientSearch(debouncedQuery);

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (client: ClientSearchResultDTO, method?: CheckInMethod) => {
    onSelectClient(client, method);
    setSearchTerm('');
    setScanError(null);
    setIsOpen(false);
  };

  const handleClear = () => {
    onClearSelection();
    setSearchTerm('');
    setScanError(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchTerm.trim();
    if (!raw) return;

    // If an item in dropdown is actively highlighted, select it
    if (
      isOpen &&
      searchResults &&
      highlightedIndex >= 0 &&
      highlightedIndex < searchResults.length
    ) {
      const selected = searchResults[highlightedIndex];
      if (selected) {
        handleSelect(selected);
        return;
      }
    }

    // Evaluate through scan-parser for barcode, QR code, or manual ID
    const parsed = parseScanPayload(raw);

    if (!parsed.isValid) {
      setScanError(parsed.error ?? 'Invalid barcode or QR payload.');
      return;
    }

    setScanError(null);

    // If candidate matches an item currently in searchResults, use the enriched entity
    const existingMatch = searchResults?.find(
      (c) =>
        c.id.toLowerCase() === parsed.clientId?.toLowerCase() ||
        c.fullName.toLowerCase() === parsed.clientId?.toLowerCase(),
    );

    if (existingMatch) {
      handleSelect(existingMatch, parsed.method);
    } else {
      // Ad-hoc client identification from authoritative scanner / manual ID
      handleSelect(
        {
          id: parsed.clientId!,
          fullName: `Client (${parsed.clientId})`,
          email: `${parsed.clientId}@kinergy.client`,
          status: 'ACTIVE',
        },
        parsed.method,
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setScanError(null);
      return;
    }

    if (!isOpen || !searchResults || searchResults.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    }
  };

  if (selectedClient) {
    return (
      <div
        className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
        data-testid="selected-client-card"
      >
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
            {selectedClient.fullName.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-sm text-foreground">
                {selectedClient.fullName}
              </span>
              <Badge variant="secondary" size="sm" className="text-[10px]">
                {selectedClient.status}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              ID: {selectedClient.id} &bull; {selectedClient.email}
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          className="text-xs h-7 px-2.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          data-testid="clear-client-selection-btn"
        >
          Change Member
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full space-y-2"
      data-testid="client-search-container"
    >
      <form onSubmit={handleSubmit} className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Scan barcode / QR badge or type name / ID..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setScanError(null);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          className="pr-20 text-xs sm:text-sm h-10 w-full"
          data-testid="client-search-input"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          role="combobox"
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1.5">
          {(isLoading || isFetching) && <Spinner size="sm" />}
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setScanError(null);
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground text-xs p-1"
              aria-label="Clear search input"
            >
              ✕
            </button>
          )}
          <Badge
            variant="outline"
            className="text-[10px] hidden sm:inline-flex bg-muted/40 font-mono text-muted-foreground border-border/60"
            title="Hardware barcode/RFID wedge scanners automatically enter code and submit"
          >
            Scanner Ready
          </Badge>
        </div>
      </form>

      {/* Scanner Parse Error Alert */}
      {scanError && (
        <Alert variant="destructive" className="py-2 text-xs" data-testid="scan-error-alert">
          {scanError}
        </Alert>
      )}

      {/* Search API Failure Alert */}
      {searchError && (
        <Alert variant="destructive" className="py-2 text-xs" data-testid="search-error-alert">
          Failed to search members: {searchError.message}
        </Alert>
      )}

      {/* Autocomplete Dropdown List */}
      {isOpen && debouncedQuery.length >= 2 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-60 overflow-y-auto animate-in fade-in-50"
          data-testid="client-search-dropdown"
          role="listbox"
        >
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center space-x-2">
              <Spinner size="sm" />
              <span>Searching client registry...</span>
            </div>
          ) : searchResults && searchResults.length > 0 ? (
            <div className="py-1 divide-y divide-border/40">
              {searchResults.map((client, idx) => {
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleSelect(client)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                      isHighlighted
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    data-testid={`client-search-item-${client.id}`}
                    role="option"
                    aria-selected={isHighlighted}
                  >
                    <div>
                      <div className="font-medium text-foreground">{client.fullName}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {client.id} &bull; {client.email}
                      </div>
                    </div>
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {client.status}
                    </Badge>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No matching client found for &ldquo;{debouncedQuery}&rdquo;.
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleSelect({
                      id: debouncedQuery,
                      fullName: `Client (${debouncedQuery})`,
                      email: `${debouncedQuery}@kinergy.client`,
                      status: 'ACTIVE',
                    });
                  }}
                  className="text-primary hover:underline font-semibold"
                >
                  Use &ldquo;{debouncedQuery}&rdquo; as ID
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
