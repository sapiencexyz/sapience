'use client';

export default function ClaudeVideoPlayer() {
  return (
    <div className="flex items-center justify-center w-full h-full bg-black rounded-lg overflow-hidden shadow-inner">
      <video
        className="w-full h-full object-cover"
        src="/claude.mp4"
        autoPlay
        loop
        muted
        playsInline
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
