'use client';

import { AnimatePresence, motion } from 'framer-motion';
import ChatButton from '~/components/layout/ChatButton';
import { useChat } from '~/lib/context/ChatContext';

const FloatingChatButton = () => {
  const { isOpen } = useChat();

  return (
    <AnimatePresence initial={false}>
      {!isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
        >
          <ChatButton iconOnly />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FloatingChatButton;
