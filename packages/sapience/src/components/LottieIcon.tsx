import { useLottie } from 'lottie-react';
import { useEffect, useState } from 'react';

interface LottieIconProps {
  animationPath: string;
  className?: string;
  width?: number;
  height?: number;
}

const LottieIcon = ({
  animationPath,
  className = '',
  width = 24,
  height = 24,
}: LottieIconProps) => {
  const [isPlaying, setIsPlaying] = useState(true);

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

  const { View, play, pause } = useLottie(options);

  useEffect(() => {
    // Start animation
    play();

    // Get the animation duration from the loaded animation data
    // We'll just use a timeout for now since we can't easily get the duration
    const timeoutId = setTimeout(() => {
      setIsPlaying(false);
    }, 2000); // Default to 2 seconds if we can't determine duration

    return () => clearTimeout(timeoutId);
  }, [play]);

  // When animation ends, pause on the last frame instead of stopping
  useEffect(() => {
    if (!isPlaying) {
      pause();
    }
  }, [isPlaying, pause]);

  return View;
};

export default LottieIcon;
