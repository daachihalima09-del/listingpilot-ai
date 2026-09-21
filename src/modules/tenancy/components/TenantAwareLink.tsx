'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type ComponentProps } from 'react';
import { tenantAwarePath } from '../tenant-route-context';

type TenantAwareLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
};

function ResolvedTenantAwareLink({ href, ...props }: TenantAwareLinkProps) {
  const searchParams = useSearchParams();
  const destination = tenantAwarePath(href, {
    organizationId: searchParams.get('organizationId') ?? undefined,
    workspaceId: searchParams.get('workspaceId') ?? undefined,
  });
  return <Link href={destination} {...props} />;
}

export function TenantAwareLink({
  href,
  children,
  className,
  ...props
}: TenantAwareLinkProps) {
  return (
    <Suspense
      fallback={(
        <span className={className} aria-disabled="true">
          {children}
        </span>
      )}
    >
      <ResolvedTenantAwareLink
        href={href}
        className={className}
        {...props}
      >
        {children}
      </ResolvedTenantAwareLink>
    </Suspense>
  );
}
