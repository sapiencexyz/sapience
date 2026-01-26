import type { Metadata } from 'next';
import SettingsPageContent from '~/components/settings/pages/SettingsPageContent';

export const metadata: Metadata = {
  title: 'Account Settings',
  description: 'Manage your account and preferences',
};

const SettingsPage = () => {
  return <SettingsPageContent />;
};

export default SettingsPage;
