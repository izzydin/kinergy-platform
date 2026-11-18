import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kinergy-platform/ui';
import { Globe, Clock, DollarSign, Calendar, Hash } from 'lucide-react';
import { useTranslation } from '../../../app/providers/locale-provider';
import { LanguageSelector } from '../../../shared/i18n/language-selector';

export interface RegionalPreferencesSectionProps {
  className?: string;
}

export const RegionalPreferencesSection: React.FC<RegionalPreferencesSectionProps> = ({
  className = '',
}) => {
  const { locale, t, formatDate, formatTime, formatNumber, formatCurrency } = useTranslation();

  // Deterministic sample date/time for consistent cross-locale rendering verification
  const sampleDate = useMemo(() => new Date('2026-11-18T14:30:00.000Z'), []);
  const sampleNumber = 1250000.5;
  const sampleCurrencyAmount = 49.99;

  return (
    <div className={`space-y-4 ${className}`} data-testid="regional-preferences-container">
      {/* 1. Language Selector Card (Preserves core i18n contract & testids) */}
      <LanguageSelector variant="card" />

      {/* 2. Regional Format Standards & Previews */}
      <Card data-testid="regional-standards-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>
              {locale === 'es'
                ? t('settings.general.regional.formatsTitle', 'Estándares de formato regional')
                : 'Regional Format Standards'}
            </CardTitle>
          </div>
          <CardDescription>
            {locale === 'es'
              ? 'Revisa cómo se representan fechas, horas, números y moneda según el idioma y la configuración de la sede.'
              : 'Review how dates, times, numerical amounts, and currency are rendered according to active locale and facility settings.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Timezone Standard */}
            <div className="rounded-lg border border-border p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {locale === 'es'
                    ? t('settings.general.regional.timezoneLabel', 'Zona horaria del sistema')
                    : 'System Timezone'}
                </span>
              </div>
              <p
                className="font-semibold text-sm text-foreground"
                data-testid="regional-timezone-value"
              >
                America/New_York (UTC-5)
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === 'es'
                  ? 'Las transacciones y citas se programan en el horario comercial de la sede.'
                  : 'Transactions and appointments are scheduled in facility business time.'}
              </p>
            </div>

            {/* Currency Standard */}
            <div className="rounded-lg border border-border p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {locale === 'es'
                    ? t('settings.general.regional.currencyLabel', 'Moneda operativa estándar')
                    : 'Standard Operating Currency'}
                </span>
              </div>
              <p
                className="font-semibold text-sm text-foreground"
                data-testid="regional-currency-value"
              >
                USD ($)
              </p>
              <p className="text-xs text-muted-foreground">
                {locale === 'es'
                  ? 'Utilizada en TPV, ventas, facturación y precios de membresías.'
                  : 'Used across POS, sales, billing, and membership pricing.'}
              </p>
            </div>
          </div>

          {/* Dynamic Live Previews */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <h4 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground">
              {locale === 'es'
                ? 'Vistas previas en vivo (según idioma activo)'
                : 'Live Previews (Active Locale)'}
            </h4>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-border/80 bg-background p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  <span>{locale === 'es' ? 'Fecha' : 'Date Format'}</span>
                </div>
                <p className="font-medium text-sm text-foreground" data-testid="preview-date">
                  {formatDate(sampleDate, { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>

              <div className="rounded-md border border-border/80 bg-background p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  <span>{locale === 'es' ? 'Hora' : 'Time Format'}</span>
                </div>
                <p className="font-medium text-sm text-foreground" data-testid="preview-time">
                  {formatTime(sampleDate)}
                </p>
              </div>

              <div className="rounded-md border border-border/80 bg-background p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Hash className="h-3 w-3" aria-hidden="true" />
                  <span>{locale === 'es' ? 'Número' : 'Number Format'}</span>
                </div>
                <p className="font-medium text-sm text-foreground" data-testid="preview-number">
                  {formatNumber(sampleNumber)}
                </p>
              </div>

              <div className="rounded-md border border-border/80 bg-background p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3" aria-hidden="true" />
                  <span>{locale === 'es' ? 'Moneda' : 'Currency Format'}</span>
                </div>
                <p className="font-medium text-sm text-foreground" data-testid="preview-currency">
                  {formatCurrency(sampleCurrencyAmount)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
