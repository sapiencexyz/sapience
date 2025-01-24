'use client';

import AdvancedView from '~/components/advancedView';

const Market = ({ params }: { params: { id: string; epoch: string } }) => {
  return <AdvancedView params={params} isTrade />;
};

export default Market;
