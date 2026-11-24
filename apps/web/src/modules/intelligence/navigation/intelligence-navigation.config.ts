import { Bot, BookOpen } from 'lucide-react';
import type { NavigationItem } from '../../../app/navigation/navigation.types';
import { navigationRegistry } from '../../../app/navigation/navigation-registry';
import { KNOWLEDGE_ALLOWED_ROLES } from '../routes/intelligence-knowledge-guard';

/**
 * Navigation items for the Kynergy Intelligence feature module.
 * Conforms strictly to ADR-AI-09-04 (Role-Based Intelligence Feature Gating).
 *
 * Structure:
 * - Section: 'intelligence' (Title: "Intelligence")
 *   - AI Assistant: /intelligence/chat (Accessible to all authenticated staff)
 *   - Knowledge Center: /intelligence/knowledge (Restricted to KNOWLEDGE_ALLOWED_ROLES)
 */
export const intelligenceNavigationItems: NavigationItem[] = [
  {
    id: 'intelligence:chat',
    label: 'AI Assistant',
    path: '/intelligence/chat',
    icon: Bot,
    order: 10,
    section: 'intelligence',
  },
  {
    id: 'intelligence:knowledge',
    label: 'Knowledge Center',
    path: '/intelligence/knowledge',
    icon: BookOpen,
    order: 20,
    section: 'intelligence',
    requiredRoles: KNOWLEDGE_ALLOWED_ROLES,
  },
];

/**
 * Registers Intelligence navigation items dynamically with the application's central navigationRegistry.
 */
export function registerIntelligenceNavigation(): void {
  navigationRegistry.registerMany(intelligenceNavigationItems);
}
