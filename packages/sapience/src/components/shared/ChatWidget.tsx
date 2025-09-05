'use client';

import { Card } from '@sapience/ui/components/ui/card';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { ChatHeader } from './chat/ChatHeader';
import { ChatMessages } from './chat/ChatMessages';
import { ChatInput } from './chat/ChatInput';
import { useChatConnection } from './chat/useChatConnection';
import { useDraggable } from './chat/useDraggable';
import { useChat } from '~/lib/context/ChatContext';

const ChatWidget = () => {
  const { isOpen, closeChat } = useChat();
  const { wallets } = useWallets();
  const { ready, authenticated } = usePrivy();
  const connectedWallet = wallets[0];
  const addressOverride =
    ready && authenticated ? connectedWallet?.address : undefined;

  const {
    state: { messages, pendingText, setPendingText, canChat, canType },
    actions: { sendMessage, loginNow },
  } = useChatConnection(isOpen, addressOverride);

  const {
    refs: { containerRef, headerRef, closeBtnRef },
    position,
    handlers: { onHeaderMouseDown, onHeaderTouchStart },
  } = useDraggable();

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed z-[60] ${position ? '' : 'bottom-4 right-4'}`}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      <Card className="w-80 shadow-xl border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <ChatHeader
          onClose={closeChat}
          headerRef={headerRef as React.RefObject<HTMLDivElement>}
          closeBtnRef={closeBtnRef as React.RefObject<HTMLButtonElement>}
          onHeaderMouseDown={onHeaderMouseDown}
          onHeaderTouchStart={onHeaderTouchStart}
        />
        <ChatMessages messages={messages} showLoader={canChat} />
        <ChatInput
          value={pendingText}
          onChange={setPendingText}
          onSend={sendMessage}
          canChat={canChat}
          canType={canType}
          onLogin={loginNow}
        />
      </Card>
    </div>
  );
};

export default ChatWidget;
