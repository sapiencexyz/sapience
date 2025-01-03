import Image from 'next/image';
import type { FC } from 'react';

type IconProps = {
  className?: string;
};

export const MARKET_CATEGORIES = [
  {
    id: 'ethereum-gas',
    name: 'Ethereum Gas',
    iconPath: '/eth.svg',
  },
  {
    id: 'celestia-blobspace',
    name: 'Celestia Blobspace',
    iconPath: '/tia.svg',
  },
] as const; 