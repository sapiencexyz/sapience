'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '~/components/ui/button';
import { useResources } from '~/lib/hooks/useResources';

export const ResourceNav = () => {
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to first resource if no resource is selected
  if (pathname === '/' && resources?.length) {
    router.push(`/resources/${resources[0].slug}`);
    return null;
  }

  if (isLoadingResources) {
    return null;
  }

  const currentResource = pathname.startsWith('/resources/')
    ? pathname.slice('/resources/'.length)
    : '';

  return (
    <div className="w-full border-b border-border">
      <div className="flex overflow-x-auto p-2 gap-2 no-scrollbar">
        {resources?.map((resource) => {
          const isSelected = resource.slug === currentResource;
          return (
            <Link
              key={resource.id}
              href={`/resources/${resource.slug}`}
              className="flex-shrink-0"
            >
              <Button
                variant={isSelected ? 'default' : 'outline'}
                className={`shadow-sm gap-2 ${isSelected ? 'pointer-events-none' : ''}`}
              >
                <Image
                  src={resource.iconPath}
                  alt={resource.name}
                  width={16}
                  height={16}
                />
                {resource.name}
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
