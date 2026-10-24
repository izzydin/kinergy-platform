import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, CardContent } from '@kinergy-platform/ui';
import { AlertTriangle, ExternalLink, ArrowRight, X } from 'lucide-react';
import type { PotentialMatchDTO } from '../types/client.types';

export interface PotentialMatchesCardProps {
  potentialMatches: readonly PotentialMatchDTO[];
  onProceedWithDuplicate: () => void;
  onDismiss: () => void;
  isSubmitting?: boolean;
}

export const PotentialMatchesCard: React.FC<PotentialMatchesCardProps> = ({
  potentialMatches,
  onProceedWithDuplicate,
  onDismiss,
  isSubmitting = false,
}) => {
  return (
    <Card
      className="border-amber-500/40 bg-amber-500/5 shadow-sm"
      data-testid="potential-matches-card"
    >
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Potential Duplicate Client Records Found
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The platform detected {potentialMatches.length} existing client profile
                {potentialMatches.length > 1 ? 's' : ''} matching the provided phone number or
                similar name.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            aria-label="Dismiss duplicate warning and edit form"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Existing Matches List */}
        <div className="space-y-2.5">
          {potentialMatches.map((match) => (
            <div
              key={match.clientId}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3 rounded-md border border-border/80 bg-background/80 text-xs"
              data-testid={`potential-match-${match.clientId}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{match.fullName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ({match.referenceNumber})
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-medium border-amber-500/40 text-amber-600 dark:text-amber-400"
                  >
                    {match.matchReason === 'EXACT_PHONE'
                      ? 'Matching Phone'
                      : match.matchReason === 'SIMILAR_PHONE'
                        ? 'Similar Phone'
                        : 'Similar Name'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span>{match.phone}</span>
                  <span>•</span>
                  <span>{match.email}</span>
                </div>
              </div>

              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 self-start sm:self-center"
              >
                <Link
                  to={`/clients/${match.clientId}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View existing profile for ${match.fullName}`}
                >
                  <span>View Profile</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-2 border-t border-amber-500/20">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            disabled={isSubmitting}
            className="text-xs"
          >
            Review & Edit Form
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onProceedWithDuplicate}
            disabled={isSubmitting}
            className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
            data-testid="bypass-duplicate-button"
          >
            <span>Proceed with Registration</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
