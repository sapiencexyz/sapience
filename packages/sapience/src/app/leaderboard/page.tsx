'use client';

import Leaderboard from '~/components/leaderboard';

const LeaderboardPage = () => {
  // Define placeholder params for the Leaderboard component
  const placeholderParams = {
    id: '0x914126c7bfa849055be8230975e0665de985f03a', // Base Yang Market
    epoch: '1',
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <Leaderboard params={placeholderParams} />
    </div>
  );
};

export default LeaderboardPage;
