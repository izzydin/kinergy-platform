import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kinergy-platform/ui';
import { Sliders, CalendarDays, Boxes, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../../app/providers/locale-provider';

export interface OperationalStandardsSectionProps {
  className?: string;
}

export const OperationalStandardsSection: React.FC<OperationalStandardsSectionProps> = ({
  className = '',
}) => {
  const { locale, t } = useTranslation();

  return (
    <Card className={`w-full ${className}`} data-testid="operational-standards-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sliders className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle>
            {locale === 'es'
              ? t('settings.general.operational.title', 'Estándares y políticas operativas')
              : 'Operational Standards & Policies'}
          </CardTitle>
        </div>
        <CardDescription>
          {locale === 'es'
            ? t(
                'settings.general.operational.description',
                'Valores operativos predeterminados de la sede y propiedad de módulos.',
              )
            : 'Facility operational defaults and domain module governance.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/scheduling/rooms"
            className="rounded-lg border border-border p-3.5 space-y-1.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="op-link-scheduling"
          >
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>{locale === 'es' ? 'Agenda e instalaciones' : 'Scheduling & Rooms'}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {locale === 'es'
                ? 'Horarios comerciales, salas y ventanas de mantenimiento.'
                : 'Facility operating hours, room slots, and maintenance windows.'}
            </p>
          </Link>

          <Link
            to="/resources/inventory"
            className="rounded-lg border border-border p-3.5 space-y-1.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="op-link-resources"
          >
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Boxes className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>{locale === 'es' ? 'Recursos e inventario' : 'Inventory & Assets'}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {locale === 'es'
                ? 'Umbrales de stock mínimo, ciclos de vida e insumos.'
                : 'Stock reorder thresholds, equipment maintenance, and assets.'}
            </p>
          </Link>

          <Link
            to="/settings/security"
            className="rounded-lg border border-border p-3.5 space-y-1.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="op-link-security"
          >
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>{locale === 'es' ? 'Seguridad y acceso' : 'Security & Access'}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {locale === 'es'
                ? 'Contraseñas de personal y directivas de autenticación.'
                : 'Staff password management and session security policies.'}
            </p>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          {locale === 'es'
            ? 'Para prevenir conflictos de sincronización, la configuración específica de operaciones se gestiona directamente en su módulo de dominio correspondiente.'
            : 'To prevent synchronization conflicts, domain-specific operational rules are governed directly in their respective modules.'}
        </p>
      </CardContent>
    </Card>
  );
};
