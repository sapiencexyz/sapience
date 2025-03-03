'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '~/components/ui/button';
import { useResources } from '~/lib/hooks/useResources';

const EarnResourceNav = () => {
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const pathname = usePathname();

  if (isLoadingResources) {
    return null;
  }

  // Filter for ethereum gas and blobspace markets
  const earnResources = resources?.filter(
    (resource) =>
      resource.slug === 'ethereum-gas' || resource.slug === 'ethereum-blobspace'
  );

  const currentResource = pathname.startsWith('/earn/')
    ? pathname.slice('/earn/'.length)
    : '';

  return (
    <div className="w-full border-b border-border">
      <div className="flex overflow-x-auto p-2 gap-2 no-scrollbar">
        {earnResources?.map((resource) => {
          const isSelected = resource.slug === currentResource;
          return (
            <Link
              key={resource.id}
              href={`/earn/${resource.slug}`}
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

export default EarnResourceNav;
