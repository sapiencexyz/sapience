import { useLottie } from 'lottie-react';
import { useEffect } from 'react';

interface LottieIconProps {
  animationPath: string;
  className?: string;
  width?: number;
  height?: number;
}

const LottieIcon = ({
  animationPath,
  className = '',
  width = 28,
  height = 28,
}: LottieIconProps) => {
  const options = {
    animationData: undefined,
    path: animationPath,
    loop: false,
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

export default LottieIcon;
