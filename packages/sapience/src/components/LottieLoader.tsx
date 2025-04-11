import { useLottie } from 'lottie-react';

interface LottieLoaderProps {
  className?: string;
  width?: number;
  height?: number;
}

const LottieLoader = ({
  className = '',
  width = 24,
  height = 24,
}: LottieLoaderProps) => {
  const options = {
    animationData: undefined,
    path: '/lottie/loader.json',
    loop: true,
    autoplay: true,
    className,
    style: {
      width,
      height,
    },
  };

  const { View } = useLottie(options);

  return <span className="dark:invert">{View}</span>;
};

export default LottieLoader;
