'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function CursorSection() {
  return (
    <section className="pt-24 pb-48 px-4 sm:px-6 w-full relative z-10">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
          {/* Image column - now order-1 on md, order-1 on small screens */}
          <div className="w-full lg:w-2/3 flex items-center justify-center order-1 lg:order-1">
            <Image
              src="/cursor.png"
              alt="Cursor Logo"
              width={800} // Defines aspect ratio
              height={300} // Defines aspect ratio
              layout="responsive"
              className="w-full rounded-lg shadow-xl shadow-inner" // Added shadow-inner
            />
          </div>
          {/* Text content column - now order-2 on lg, order-2 on small screens */}
          <div className="w-full lg:w-1/2 mb-8 lg:mb-0 order-2 lg:order-2">
            <div className="lg:max-w-[380px] lg:mx-auto space-y-4 lg:space-y-6">
              <h2 className="font-sans text-2xl lg:text-3xl font-normal">
                Use Sapience with Cursor
              </h2>

              <p className="text-lg text-muted-foreground">
                Supercharge{' '}
                <Link
                  href="https://www.cursor.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Cursor
                </Link>{' '}
                by{' '}
                <Link
                  href="https://docs.sapience.xyz/docs-for-cursor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  adding Sapience&apos;s docs
                </Link>
                . Then, connect the MCP server so it can access tools during
                software development.
              </p>

              <div className="pt-2">
                <Link
                  href="https://docs.sapience.xyz/mcp/use-with-cursor" // Assuming this link, replace if different
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="sm:w-auto">
                    <Plus className="h-4 w-4" />
                    Add to Cursor
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
