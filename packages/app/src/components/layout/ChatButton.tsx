'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef } from 'react';

import { useChat } from '~/lib/context/ChatContext';

type ChatButtonProps = {
  onAfterClick?: () => void;
  // When true, render an icon-only circular button (for desktop header)
  iconOnly?: boolean;
};

const ChatButton = ({ onAfterClick, iconOnly = false }: ChatButtonProps) => {
  const { toggleChat } = useChat();
  const controls = useAnimationControls();
  const isHoveredRef = useRef(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (isHoveredRef.current) return;
      controls.start({
        scale: [1, 1.1, 1],
        transition: { duration: 0.6, ease: 'easeInOut' },
      });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [controls]);

  if (iconOnly) {
    return (
      <motion.div
        className="inline-block"
        initial={{ scale: 1 }}
        animate={controls}
        onHoverStart={() => {
          isHoveredRef.current = true;
          controls.stop();
        }}
        onHoverEnd={() => {
          isHoveredRef.current = false;
        }}
      >
        <Button
          variant="default"
          size="icon"
          className="rounded-full h-10 w-10 shadow-md transition-transform duration-500 hover:scale-[1.1]"
          onClick={() => {
            if (onAfterClick) onAfterClick();
            toggleChat();
          }}
          aria-label="Toggle chat"
        >
          <MessageCircle className="h-10 w-10" />
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex w-fit mx-3 mt-0">
        <motion.div
          className="inline-block"
          initial={{ scale: 1 }}
          animate={controls}
          onHoverStart={() => {
            isHoveredRef.current = true;
            controls.stop();
          }}
          onHoverEnd={() => {
            isHoveredRef.current = false;
          }}
        >
          <Button
            variant="default"
            size="xs"
            className="rounded-full px-3 justify-start gap-2"
            onClick={() => {
              if (onAfterClick) onAfterClick();
              toggleChat();
            }}
          >
            <MessageCircle className="h-3 w-3 scale-[0.8]" />
            <span className="relative top-[1px]">Chat</span>
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default ChatButton;
