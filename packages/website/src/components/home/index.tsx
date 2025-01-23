import { Corners } from './corners';
import { Hero } from './hero';
import { Features } from './features';
import { PoweredBy } from './powered-by';
import { HowItWorks } from './how-it-works';
import { Investors } from './investors';
import { FAQ } from './faq';

const Home = () => {
  return (
    <div className="w-100 flex min-h-[100dvh] flex-col items-center justify-center">
      <Corners />
      <Hero />
      <Features />
      <PoweredBy />
      <HowItWorks />
      <Investors />
      <FAQ />
    </div>
  );
};

export default Home;
