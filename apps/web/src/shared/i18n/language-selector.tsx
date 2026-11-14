import React from 'react';
import { Globe, Check } from 'lucide-react';
import { useLocale } from '../../app/providers/locale-provider';
import type { SupportedLocale } from './types';

export interface LanguageSelectorProps {
  variant?: 'compact' | 'card' | 'inline';
  className?: string;
  onLanguageChange?: (locale: SupportedLocale) => void;
}

/**
 * Accessible Language Selector (`en` / `es`)
 *
 * Allows authenticated employees (and unauthenticated users on login) to switch
 * between English (`en`) and Latin American Spanish (`es`) immediately without a page reload.
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'compact',
  className = '',
  onLanguageChange,
}) => {
  const { locale, setLocale, t } = useLocale();

  const handleSelect = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
    onLanguageChange?.(nextLocale);
  };

  if (variant === 'card') {
    return (
      <div
        className={`rounded-lg border border-border bg-card p-6 shadow-sm space-y-4 ${className}`}
        data-testid="settings-language-card"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-base font-semibold text-foreground">
                {t('settings.language.cardTitle', 'Language & Regional Preferences')}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                'settings.language.cardDescription',
                'Select your preferred display language for the Kinergy workspace. This preference is saved to your employee profile and applied immediately.',
              )}
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            data-testid="active-locale-badge"
          >
            {locale === 'es' ? 'Español (es-419)' : 'English (en-US)'}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label={t('settings.language.selectLabel', 'Display Language')}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1"
          data-testid="language-selector"
        >
          <button
            type="button"
            role="radio"
            aria-checked={locale === 'en'}
            onClick={() => handleSelect('en')}
            data-testid="lang-option-en"
            className={`flex items-start justify-between rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              locale === 'en'
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border bg-background hover:bg-muted/50 text-foreground'
            }`}
          >
            <div className="space-y-0.5">
              <span className="block text-sm font-semibold">
                {t('settings.language.englishOption', 'English')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('settings.language.englishHint', 'Default interface language (en-US)')}
              </span>
            </div>
            {locale === 'en' && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={locale === 'es'}
            onClick={() => handleSelect('es')}
            data-testid="lang-option-es"
            className={`flex items-start justify-between rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              locale === 'es'
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border bg-background hover:bg-muted/50 text-foreground'
            }`}
          >
            <div className="space-y-0.5">
              <span className="block text-sm font-semibold">
                {t('settings.language.spanishOption', 'Español (Latinoamérica)')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(
                  'settings.language.spanishHint',
                  'Latin American Spanish operational terminology (es-419)',
                )}
              </span>
            </div>
            {locale === 'es' && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 ${className}`}
      data-testid="language-selector"
      role="group"
      aria-label={t('nav.switchLanguage', 'Interface Language')}
    >
      {variant === 'compact' && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('common.language', 'Language')}</span>
        </span>
      )}
      <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => handleSelect('en')}
          aria-pressed={locale === 'en'}
          data-testid="lang-option-en"
          className={`rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            locale === 'en'
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => handleSelect('es')}
          aria-pressed={locale === 'es'}
          data-testid="lang-option-es"
          className={`rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            locale === 'es'
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Español
        </button>
      </div>
    </div>
  );
};
