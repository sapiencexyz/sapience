import { ResourceSlug } from './resources';

export interface FocusArea {
  id: string;
  name: string;
  description: string;
  resources: ResourceSlug[];
  iconSvg: string;
  color: string;
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    id: 'compute',
    name: 'Decentralized Compute',
    description: 'Explore the frontier where distributed networks are revolutionizing computing power. Track how blockchain infrastructure is democratizing access and reshaping our digital landscape.',
    resources: ['ethereum-gas', 'base-gas', 'arbitrum-gas', 'ethereum-blobspace', 'celestia-blobspace', 'bitcoin-fees'],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="5" cy="19" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 7V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 5H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 19H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 7V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.5 6.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17.5 6.5L13.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.5 17.5L10.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17.5 17.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#3B82F6', // blue-500
  },
  {
    id: 'energy',
    name: 'Energy + DePIN',
    description: 'Witness the convergence of decentralized physical infrastructure and next-gen energy systems. Discover how nuclear innovation and renewables are creating resilient networks that power our future.',
    resources: [],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#C084FC', // purple-400
  },
  {
    id: 'climate',
    name: 'Climate Change',
    description: 'Navigate the complex dynamics of our changing planet through cutting-edge climate science. Track temperature shifts, sea-level rise, and extreme weather patterns that will shape our collective future.',
    resources: [],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L4 7L12 12L20 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 12L12 17L20 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 17L12 22L20 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#4ADE80', // green-400
  },
  {
    id: 'biosecurity',
    name: 'Biosecurity',
    description: 'Delve into the critical intersection of biology and security. Explore how advanced forecasting helps us anticipate and prevent biological threats, from pandemic risks to emerging biotechnology challenges.',
    resources: [],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="7" cy="14" r="2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="17" cy="14" r="2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.5 8.5L7.5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14.5 8.5L16.5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 14.5H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#FBBF24', // amber-400
  },
  {
    id: 'international',
    name: 'International Relations',
    description: 'Decode the complex web of global power dynamics and diplomatic chess moves. Gain insights into emerging alliances, potential conflicts, and the shifting tectonic plates of international politics.',
    resources: [],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 21H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 21V7L13 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 21V11L13 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 9V9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 13V13.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 17V17.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#F87171', // red-400
  },
  {
    id: 'space',
    name: 'Space Exploration',
    description: 'Journey to the final frontier where humanity\'s boldest ambitions unfold. Track breakthroughs in rocket technology, satellite networks, and interplanetary missions that are expanding our cosmic horizons.',
    resources: [],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#22D3EE', // cyan-400
  },
  {
    id: 'tech',
    name: 'Emerging Technologies',
    description: 'Peer into the technological crystal ball where AI, quantum computing, and biotech converge. Discover which innovations will reshape industries, transform human capabilities, and define our collective future.',
    resources: [],
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 2C9.5 2 9 6 9 9C9 12 12 12 12 12C12 12 15 12 15 9C15 6 14.5 2 14.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 12V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 12C5 12 3 14 3 16C3 18.5 5 20 8 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 12C19 12 21 14 21 16C21 18.5 19 20 16 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>`,
    color: '#FB923C', // orange-400
  }
];

export const DEFAULT_FOCUS_AREA = FOCUS_AREAS[0]; 