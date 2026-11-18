import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from '@kinergy-platform/ui';
import { Sun, Moon, Laptop, Palette, Check } from 'lucide-react';
import { useTranslation } from '../../../app/providers/locale-provider';
import { useOptionalTheme, type Theme } from '../../../app/providers/theme-provider';

export interface ApplicationPreferencesSectionProps {
  className?: string;
}

export const ApplicationPreferencesSection: React.FC<ApplicationPreferencesSectionProps> = ({
  className = '',
}) => {
  const { locale, t } = useTranslation();
  const themeContext = useOptionalTheme();
  const theme: Theme = themeContext?.theme ?? 'light';
  const resolvedTheme = themeContext?.resolvedTheme ?? 'light';
  const setTheme = themeContext?.setTheme ?? (() => {});

  const themeOptions: Array<{
    id: Theme;
    title: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'light',
      title: locale === 'es' ? 'Claro' : 'Light',
      description:
        locale === 'es'
          ? 'Paleta diurna limpia con texto de alto contraste.'
          : 'Clean daylight palette with high-contrast text.',
      icon: <Sun className="h-4 w-4 text-amber-500" aria-hidden="true" />,
    },
    {
      id: 'dark',
      title: locale === 'es' ? 'Oscuro' : 'Dark',
      description:
        locale === 'es'
          ? 'Paleta oscura de bajo brillo optimizada para jornadas operativas.'
          : 'Low-glare dark palette optimized for evening operations.',
      icon: <Moon className="h-4 w-4 text-indigo-400" aria-hidden="true" />,
    },
    {
      id: 'system',
      title: locale === 'es' ? 'Predeterminado del sistema' : 'System default',
      description:
        locale === 'es'
          ? 'Coincide automáticamente con la preferencia del sistema operativo.'
          : 'Automatically match operating system preferences.',
      icon: <Laptop className="h-4 w-4 text-primary" aria-hidden="true" />,
    },
  ];

  return (
    <Card className={`w-full ${className}`} data-testid="application-preferences-card">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>
                {locale === 'es'
                  ? t('settings.general.appearance.title', 'Preferencias de la aplicación')
                  : 'Application Preferences'}
              </CardTitle>
            </div>
            <CardDescription>
              {locale === 'es'
                ? t(
                    'settings.general.appearance.description',
                    'Configura la apariencia de la interfaz y el modo de tema visual.',
                  )
                : 'Configure interface appearance and visual theme mode.'}
            </CardDescription>
          </div>

          <Badge variant="outline" className="w-fit gap-1 text-xs" data-testid="active-theme-badge">
            <span>
              {locale === 'es' ? 'Tema activo:' : 'Active Theme:'}{' '}
              <strong className="capitalize">{theme}</strong>
              {theme === 'system' && ` (${resolvedTheme})`}
            </span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            {locale === 'es'
              ? t('settings.general.appearance.themeLabel', 'Tema de la interfaz')
              : 'Interface Theme'}
          </label>

          <div
            role="radiogroup"
            aria-label={locale === 'es' ? 'Tema de la interfaz' : 'Interface Theme'}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            data-testid="theme-selector-radiogroup"
          >
            {themeOptions.map((opt) => {
              const isSelected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setTheme(opt.id)}
                  data-testid={`theme-option-${opt.id}`}
                  className={`flex flex-col justify-between rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                      : 'border-border bg-card hover:bg-muted/40 text-foreground'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        {opt.icon}
                        <span>{opt.title}</span>
                      </div>
                      {isSelected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {locale === 'es'
            ? 'Esta preferencia se guarda en el almacenamiento local de tu navegador y se aplica de inmediato.'
            : 'This preference is saved to your browser local storage and applied immediately.'}
        </p>
      </CardContent>
    </Card>
  );
};
