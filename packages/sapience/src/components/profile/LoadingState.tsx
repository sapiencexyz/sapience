import LottieLoader from '~/components/shared/LottieLoader';

export default function LoadingState() {
  return (
    <div className="flex h-fullw-full items-center justify-center">
      <LottieLoader width={32} height={32} />
    </div>
  );
}
