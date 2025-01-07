import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '~/lib/constants/constants';

export interface Resource {
  id: number;
  name: string;
  slug: string;
  iconPath: string;
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