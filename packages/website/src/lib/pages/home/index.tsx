import { Corners } from "./components/corners";
import { Hero } from "./components/hero";
import { Features } from "./components/features";
import { PoweredBy } from "./components/powered-by";
import { HowItWorks } from "./components/how-it-works";
import { Investors } from "./components/investors";
import { FAQ } from "./components/faq";

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
