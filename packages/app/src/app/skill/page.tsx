import type { Metadata } from 'next';
import SkillsPageContent from '~/components/skills/pages/SkillsPageContent';

export const metadata: Metadata = {
  title: 'Sapience Skill for Agents',
  description: 'Trade prediction markets with your AI agent',
  openGraph: {
    images: [
      {
        url: '/og-skills.png',
        width: 1200,
        height: 630,
        alt: 'Sapience Skill for Agents - Compatible with Claude, Codex, OpenClaw',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-skills.png'],
  },
};

const SkillsPage = () => {
  return <SkillsPageContent />;
};

export default SkillsPage;
