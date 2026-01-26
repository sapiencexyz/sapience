import type { Metadata } from 'next';
import Leaderboard from '~/components/leaderboard/Leaderboard';
import PageContainer from '~/components/layout/PageContainer';

export const metadata: Metadata = {
  title: 'Forecaster Leaderboard',
  description: 'Top forecasters and traders ranked by accuracy and profit',
};

const LeaderboardPage = () => {
  return (
    <PageContainer>
      <Leaderboard />
    </PageContainer>
  );
};

export default LeaderboardPage;
