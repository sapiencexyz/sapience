'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '~/components/ui/button';
import { useResources } from '~/lib/hooks/useResources';

const ResourceNav = () => {
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const pathname = usePathname();
  const router = useRouter();

  // Handle redirect in useEffect to avoid conditional hook calls
  useEffect(() => {
    if (pathname === '/' && resources?.length) {
      router.push(`/resources/${resources[0].slug}`);
    }
  }, [pathname, resources, router]);

  if (isLoadingResources) {
    return null;
  }

  // Early return after hooks are called
  if (pathname === '/' && resources?.length) {
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
              // Use shallow routing to prevent full page refresh
              shallow
            >
              <Button
                variant={isSelected ? 'default' : 'outline'}
                className={`shadow-sm gap-2 ${isSelected ? 'pointer-events-none' : ''}`}
              >
                <Image
                  src={resource.iconPath}
                  alt={resource.name}
                  width={22}
                  height={22}
                  className=" "
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

export default ResourceNav;
