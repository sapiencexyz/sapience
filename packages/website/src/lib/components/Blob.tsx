import { Box } from '@chakra-ui/react';
import Spline from '@splinetool/react-spline/next';

export default function Home() {
  return (
    <Box transform="scale(1.5) translateY(15%)" opacity="0.9" height="100dvh">
      <Spline scene="https://prod.spline.design/gyoZ1cjoFk5-20wQ/scene.splinecode" />
    </Box>
  );
}
