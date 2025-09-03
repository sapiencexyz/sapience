'use client';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@sapience/ui/components/ui/toggle-group';
import { Label } from '@sapience/ui/components/ui/label';
import { Input } from '@sapience/ui/components/ui/input';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useChat } from '~/lib/context/ChatContext';

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const { openChat } = useChat();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="container mx-auto px-4 md:p-8 max-w-3xl mt-16">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <Card>
        <CardContent className="px-6 py-8">
          <div className="space-y-8">
            <div className="grid gap-2">
              <Label htmlFor="theme">Theme</Label>
              <div id="theme" className="flex flex-col gap-1">
                {mounted && (
                  <ToggleGroup
                    type="single"
                    value={theme ?? 'system'}
                    onValueChange={(val) => {
                      if (!val) return;
                      setTheme(val);
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full md:w-auto bg-background py-1 rounded-lg justify-start gap-2 md:gap-3"
                  >
                    <ToggleGroupItem value="light" aria-label="Light mode">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="system" aria-label="System mode">
                      <Monitor className="h-4 w-4" />
                      <span>System</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="dark" aria-label="Dark mode">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="graphql-endpoint">GraphQL Endpoint</Label>
              <Input id="graphql-endpoint" />
              <p className="text-xs text-muted-foreground">
                URL used to fetch market metadata, history, and on-chain data
                via GraphQL.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="relayer-endpoint">Relayer Endpoint</Label>
              <Input id="relayer-endpoint" />
              <p className="text-xs text-muted-foreground">
                URL of the relayer service used to submit orders in{' '}
                <em>Auction Mode</em>.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chat-endpoint">Chat Endpoint</Label>
              <Input id="chat-endpoint" />
              <p className="text-xs text-muted-foreground">
                Used by the in-app{' '}
                <button
                  type="button"
                  onClick={openChat}
                  className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                >
                  chat widget
                </button>
                to send and receive messages.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ethereum-rpc-endpoint">
                Ethereum RPC Endpoint
              </Label>
              <Input id="ethereum-rpc-endpoint" />
              <p className="text-xs text-muted-foreground">
                JSON-RPC URL for the{' '}
                <a
                  href="https://chainlist.org/chain/42161"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                >
                  Arbitrum
                </a>{' '}
                network.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
