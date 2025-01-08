import { useQuery } from '@tanstack/react-query';

import { API_BASE_URL } from '~/lib/constants/constants';

export interface Epoch {
  id: number;
  epochId: number;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
}

export interface Market {
  id: number;
  address: string;
  chainId: number;
  name: string;
  epochs: Epoch[];
}

export interface Resource {
  id: number;
  name: string;
  slug: string;
  iconPath: string;
  markets: Market[];
}

const mapResourceToIconPath = (name: string): string => {
  switch (name) {
    case 'Ethereum Gas':
      return '/eth.svg';
    case 'Celestia Blobspace':
      return '/tia.svg';
    default:
      return '';
  }
};

export const useResources = () => {
  return useQuery<Resource[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/resources`);
      const data = await response.json();
      return data.map((resource: Omit<Resource, 'iconPath'>) => ({
        ...resource,
        iconPath: mapResourceToIconPath(resource.name),
      }));
    },
  });
};

export const useLatestResourcePrice = (slug: string) => {
  return useQuery({
    queryKey: ['resourcePrice', slug],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/resources/${slug}/prices/latest`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch latest price');
      }
      return response.json();
    },
    refetchInterval: 2000, // Refetch every 2 seconds
  });
};
