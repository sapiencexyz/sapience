import type * as React from 'react';
import {
  TrendingUp,
  Coins,
  CloudSun,
  Landmark,
  FlaskConical,
  Medal,
  Tv,
} from 'lucide-react';

interface FocusArea {
  id: string;
  name: string;
  resources: string[];
  color: string;
  Icon?: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    id: 'economy-finance',
    name: 'Economy & Finance',
    resources: [],
    color: 'hsl(var(--category-3))',
    Icon: TrendingUp,
  },
  {
    id: 'crypto',
    name: 'Crypto',
    resources: [
      'ethereum-gas',
      'base-gas',
      'arbitrum-gas',
      'ethereum-blobspace',
      'celestia-blobspace',
      'bitcoin-fees',
    ],
    color: 'hsl(var(--category-2))',
    Icon: Coins,
  },
  {
    id: 'weather',
    name: 'Weather',
    resources: [],
    color: 'hsl(var(--category-1))',
    Icon: CloudSun,
  },
  {
    id: 'geopolitics',
    name: 'Geopolitics',
    resources: [],
    color: 'hsl(var(--category-5))',
    Icon: Landmark,
  },
  {
    id: 'tech-science',
    name: 'Tech & Science',
    resources: [],
    color: 'hsl(var(--category-4))',
    Icon: FlaskConical,
  },
  {
    id: 'sports',
    name: 'Sports',
    resources: [],
    color: 'hsl(var(--category-7))',
    Icon: Medal,
  },
  {
    id: 'culture',
    name: 'Culture',
    resources: [],
    color: 'hsl(var(--category-6))',
    Icon: Tv,
  },
];

export const getFocusAreaMap = () => {
  return new Map(
    FOCUS_AREAS.map((area) => [
      area.id,
      {
        Icon: area.Icon,
        color: area.color,
        name: area.name,
      },
    ])
  );
};
