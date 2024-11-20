'use client';

import Leaderboard from '~/lib/components/foil/leaderboard';

const LeaderboardPage = ({
  params,
}: {
  params: { id: string; epoch: string };
}) => {
  return <Leaderboard params={params} />;
};

export default LeaderboardPage;
