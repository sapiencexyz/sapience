import MarketsTable from '~/lib/components/foil/marketsTable';

const Market = () => {
  return (
    <div className="container mx-auto p-8 max-w-7xl">
      <h1 className="scroll-m-20 text-4xl font-bold tracking-tight mb-4">
        Foil Markets
      </h1>
      <MarketsTable />
    </div>
  );
};

export default Market;
