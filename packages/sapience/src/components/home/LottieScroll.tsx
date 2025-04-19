import { useLottie } from 'lottie-react';
import { useEffect } from 'react';

interface LottieScrollProps {
  className?: string;
  width?: number;
  height?: number;
}

const LottieScroll = ({
  className = '',
  width = 28,
  height = 28,
}: LottieScrollProps) => {
  const options = {
    animationData: undefined,
    path: '/lottie/scroll.json',
    loop: true,
    autoplay: true,
    className,
    style: {
      width,
      height,
    },
  };

  const { View, play } = useLottie(options);

  useEffect(() => {
    play();
  }, [play]);

  return <span className="dark:invert">{View}</span>;
};

export default LottieScroll;
