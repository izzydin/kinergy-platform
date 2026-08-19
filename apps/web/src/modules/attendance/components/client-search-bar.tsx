import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Spinner } from '@kinergy-platform/ui';
import { useClientSearch } from '../hooks/use-attendance';
import { ClientSearchResultDTO } from '../types';

interface ClientSearchBarProps {
  readonly onSelectClient: (client: ClientSearchResultDTO) => void;
  readonly selectedClient: ClientSearchResultDTO | null;
  readonly onClearSelection: () => void;
}

export const ClientSearchBar: React.FC<ClientSearchBarProps> = ({
  onSelectClient,
  selectedClient,
  onClearSelection,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce search query 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const { data: results = [], isLoading } = useClientSearch(debouncedTerm);

  // Open dropdown when results are available
  useEffect(() => {
    if (debouncedTerm.length >= 2 && results.length > 0 && !selectedClient) {
      setIsOpen(true);
      setHighlightedIndex(0);
    } else {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }, [debouncedTerm, results, selectedClient]);

  // Click outside to dismiss
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex]!);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (client: ClientSearchResultDTO) => {
    onSelectClient(client);
    setSearchTerm('');
    setIsOpen(false);
  };

  if (selectedClient) {
    return (
      <div
        className="flex items-center justify-between p-3.5 bg-card border rounded-lg shadow-sm"
        data-testid="selected-client-card"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
            {selectedClient.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{selectedClient.fullName}</h4>
            <p className="text-xs text-muted-foreground">
              ID: <span className="font-mono">{selectedClient.id}</span> • {selectedClient.email}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClearSelection}
          aria-label="Clear selected client"
          data-testid="clear-client-btn"
        >
          Change Client
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <Input
          type="text"
          placeholder="Search member by name, email, or client ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          aria-label="Search client for check-in"
          data-testid="client-search-input"
          className="w-full pl-3 pr-10"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul
          className="absolute z-50 w-full mt-1.5 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-border/50 text-sm"
          role="listbox"
          data-testid="client-search-dropdown"
        >
          {results.map((client, index) => (
            <li
              key={client.id}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={() => handleSelect(client)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`p-3 cursor-pointer transition-colors flex items-center justify-between ${
                index === highlightedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted/50'
              }`}
              data-testid={`client-result-${client.id}`}
            >
              <div>
                <p className="font-medium text-foreground">{client.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  ID: <span className="font-mono">{client.id}</span> • {client.email}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {client.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {debouncedTerm.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1.5 p-4 bg-popover border border-border rounded-lg shadow-md text-center text-sm text-muted-foreground">
          No clients found matching &ldquo;{debouncedTerm}&rdquo;
        </div>
      )}
    </div>
  );
};
