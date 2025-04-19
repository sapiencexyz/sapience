import LottieLoader from '~/components/shared/LottieLoader';

export default function LoadingState() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <LottieLoader width={32} height={32} />
    </div>
  );
}
