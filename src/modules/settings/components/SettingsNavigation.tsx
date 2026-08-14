'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  BrainCircuit,
  Building2,
  FileSliders,
  FlaskConical,
  LibraryBig,
  SearchCheck,
  Send,
  ShoppingBag,
  SlidersHorizontal,
} from 'lucide-react';
import {
  businessProfileSettingsRoutes,
  type BusinessProfileSettingsRouteId,
} from '@/modules/settings/business-profile/routes';

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

const businessProfileIcons: Record<BusinessProfileSettingsRouteId, typeof Boxes> = {
  catalog: LibraryBig,
  'listing-standard': FileSliders,
  listing: SlidersHorizontal,
  seo: SearchCheck,
  publishing: Send,
  ai: BrainCircuit,
  calibration: FlaskConical,
};

function linkClass(active: boolean): string {
  return `flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 lg:px-4 ${
    active
      ? 'bg-amber-400/15 text-amber-200 shadow-[0_0_0_1px_rgba(255,199,76,0.2)]'
      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
  }`;
}

export function SettingsNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="space-y-6">
      <div>
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
          General
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {settingsLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={linkClass(isActive)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 leading-5">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
          Business Profile
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {businessProfileSettingsRoutes.map((route) => {
            const Icon = businessProfileIcons[route.id];
            const isActive = pathname === route.href;
            const advanced = 'advanced' in route && route.advanced;
            return (
              <Link
                key={route.href}
                href={route.href}
                aria-current={isActive ? 'page' : undefined}
                className={linkClass(isActive)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 leading-5">
                  {route.label}
                  {advanced ? (
                    <span className="block text-[0.65rem] font-normal uppercase tracking-wider text-slate-600">
                      Advanced
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
