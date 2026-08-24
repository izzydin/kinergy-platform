import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Badge, Spinner } from '@kinergy-platform/ui';
import { useClientSearch } from '../hooks/use-gym-attendance';
import { ClientSearchResultDTO } from '../types';

interface ClientSearchBarProps {
  readonly selectedClient: ClientSearchResultDTO | null;
  readonly onSelectClient: (client: ClientSearchResultDTO) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: searchResults, isLoading, isFetching } = useClientSearch(debouncedQuery);

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

  const handleSelect = (client: ClientSearchResultDTO) => {
    onSelectClient(client);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim().length > 0) {
      onSelectClient({
        id: searchTerm.trim(),
        fullName: `Client (${searchTerm.trim()})`,
        email: `${searchTerm.trim()}@kinergy.client`,
        status: 'ACTIVE',
      });
      setSearchTerm('');
      setIsOpen(false);
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
          onClick={onClearSelection}
          className="text-xs h-7 px-2.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          data-testid="clear-client-selection-btn"
        >
          Change Member
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" data-testid="client-search-container">
      <form onSubmit={handleManualSubmit} className="relative">
        <Input
          type="text"
          placeholder="Type Client Name, ID, or Email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          autoFocus={autoFocus}
          className="pr-10 text-xs sm:text-sm h-10 w-full"
          data-testid="client-search-input"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          role="combobox"
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
          {(isLoading || isFetching) && <Spinner size="sm" />}
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-muted-foreground hover:text-foreground text-xs p-1"
              aria-label="Clear search input"
            >
              ✕
            </button>
          )}
        </div>
      </form>

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
              {searchResults.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => handleSelect(client)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                  data-testid={`client-search-item-${client.id}`}
                  role="option"
                  aria-selected={false}
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
              ))}
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No matching client found for &ldquo;{debouncedQuery}&rdquo;.
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectClient({
                      id: debouncedQuery,
                      fullName: `Client (${debouncedQuery})`,
                      email: `${debouncedQuery}@kinergy.client`,
                      status: 'ACTIVE',
                    });
                    setSearchTerm('');
                    setIsOpen(false);
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
