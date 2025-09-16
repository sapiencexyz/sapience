'use client';

import { Card } from '@sapience/ui/components/ui/card';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
} from 'framer-motion';
import { useCallback, useRef } from 'react';
import { ChatHeader } from './chat/ChatHeader';
import { ChatMessages } from './chat/ChatMessages';
import { ChatInput } from './chat/ChatInput';
import { useChatConnection } from './chat/useChatConnection';
import { useChat } from '~/lib/context/ChatContext';

const ChatWidget = () => {
  const { isOpen, closeChat } = useChat();
  const { wallets } = useWallets();
  const { ready, authenticated, login } = usePrivy();
  const connectedWallet = wallets[0];
  const addressOverride =
    ready && authenticated ? connectedWallet?.address : undefined;

  const {
    state: { messages, pendingText, setPendingText, canChat, canType },
    actions: { sendMessage, loginNow },
  } = useChatConnection(isOpen, addressOverride);

  const handleLogin = () => {
    if (ready && !authenticated) {
      try {
        login();
        return;
      } catch {
        /* noop */
      }
    }
    loginNow();
  };

  const constraintsRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<Element>) => {
      if (closeBtnRef.current && closeBtnRef.current.contains(e.target as Node))
        return;
      try {
        e.preventDefault();
        // Ensure the header keeps receiving pointer events even if the cursor leaves the widget
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      dragControls.start(e);
    },
    [dragControls]
  );

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <div
          ref={constraintsRef}
          className="fixed inset-0 p-2 z-[60] pointer-events-none flex items-end justify-end"
        >
          <motion.div
            ref={widgetRef}
            className="origin-center pointer-events-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            drag
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={constraintsRef}
            dragElastic={0}
            dragMomentum={false}
            style={{ x, y }}
            onDragEnd={() => {
              // No persistence for simplicity; landing position is preserved for session
            }}
          >
            <Card className="w-80 shadow-xl border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <ChatHeader
                onClose={closeChat}
                headerRef={headerRef as React.RefObject<HTMLDivElement>}
                closeBtnRef={closeBtnRef as React.RefObject<HTMLButtonElement>}
                onHeaderPointerDown={onHeaderPointerDown}
              />
              <ChatMessages
                messages={messages}
                showLoader={messages.length === 0}
                className="h-64"
              />
              <ChatInput
                value={pendingText}
                onChange={setPendingText}
                onSend={sendMessage}
                canChat={canChat}
                canType={canType}
                onLogin={handleLogin}
              />
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ChatWidget;
