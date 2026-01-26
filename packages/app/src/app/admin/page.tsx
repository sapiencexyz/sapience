import type { Metadata } from 'next';
import Admin from '../../components/admin/index';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Admin dashboard',
  robots: { index: false },
};

const AdminPage = () => {
  return <Admin />;
};

export default AdminPage;
