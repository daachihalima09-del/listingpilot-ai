'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Building2, ShoppingBag } from 'lucide-react';

const settingsLinks = [
  {
    href: '/settings/organization',
    label: 'Organization',
    icon: Building2,
  },
  {
    href: '/settings/workspace',
    label: 'Workspace',
    icon: Boxes,
  },
  {
    href: '/settings/shopify',
    label: 'Shopify',
    icon: ShoppingBag,
  },
] as const;

export function SettingsNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="space-y-2">
      {settingsLinks.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              isActive
                ? 'bg-amber-400/15 text-amber-200 shadow-[0_0_0_1px_rgba(255,199,76,0.2)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
