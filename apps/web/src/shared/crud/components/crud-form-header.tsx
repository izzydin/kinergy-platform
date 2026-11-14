import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@kinergy-platform/ui';
import type { CrudFormHeaderProps } from '../types/crud-form.types';
import { useTranslation } from '../../../app/providers/locale-provider';

export const CrudFormHeader: React.FC<CrudFormHeaderProps> = ({
  title,
  description,
  backLink,
  badge,
  className = '',
}) => {
  const { locale, t } = useTranslation();
  const displayTitle = locale === 'es' && typeof title === 'string' ? t(title, title) : title;
  const displayDescription =
    locale === 'es' && typeof description === 'string' ? t(description, description) : description;
  const backLabel = backLink?.label
    ? locale === 'es'
      ? t(backLink.label, backLink.label)
      : backLink.label
    : locale === 'es'
      ? t('common.back', 'Volver')
      : backLink?.href
        ? 'Back to list'
        : 'Back';

  return (
    <div className={`space-y-3 pb-6 border-b border-border/60 ${className}`}>
      {backLink && (
        <div>
          {backLink.href ? (
            <Link
              to={backLink.href}
              className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              {backLabel}
            </Link>
          ) : backLink.onBack ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={backLink.onBack}
              className="px-0 h-auto text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-transparent -ml-1 group"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              {backLabel}
            </Button>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{displayTitle}</h1>
            {badge}
          </div>
          {displayDescription && (
            <p className="text-sm text-muted-foreground leading-relaxed">{displayDescription}</p>
          )}
        </div>
      </div>
    </div>
  );
};

CrudFormHeader.displayName = 'CrudFormHeader';
