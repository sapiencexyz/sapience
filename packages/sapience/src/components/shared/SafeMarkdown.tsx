'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

type SafeMarkdownProps = {
  content: string | null | undefined;
  className?: string;
  /**
   * compact: minimal spacing, suitable for inline/chat bubbles
   * default: normal spacing for blocks like rules
   */
  variant?: 'compact' | 'default';
};

const ALLOWED_TAGS_DEFAULT = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'a',
  'hr',
] as const;

const ALLOWED_TAGS_COMPACT = [
  'p',
  'br',
  'strong',
  'em',
  'code',
  'a',
  'ul',
  'ol',
  'li',
] as const;

const isSafeHref = (href: string | undefined): boolean => {
  if (!href) return false;
  try {
    // Allow http, https, mailto, tel only
    const lower = href.trim().toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:'))
      return false;
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('mailto:') ||
      lower.startsWith('tel:')
    ) {
      return true;
    }
    // Relative URLs: disallow to avoid navigating app unexpectedly in chat/rules context
    return false;
  } catch {
    return false;
  }
};

export function SafeMarkdown({
  content,
  className = '',
  variant = 'default',
}: SafeMarkdownProps) {
  const text = (content ?? '').trim();

  const allowed =
    variant === 'compact' ? ALLOWED_TAGS_COMPACT : ALLOWED_TAGS_DEFAULT;
  const rootSpacing = variant === 'compact' ? 'space-y-2' : 'space-y-4';

  if (!text) return null;

  return (
    <div className={`${rootSpacing} ${className}`}>
      <ReactMarkdown
        // Ensure raw HTML is not parsed
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p({ children, ...props }) {
            return <p {...props}>{children}</p>;
          },
          ul({ children, ...props }) {
            return (
              <ul className="list-disc pl-5 space-y-1" {...props}>
                {children}
              </ul>
            );
          },
          ol({ children, ...props }) {
            return (
              <ol className="list-decimal pl-5 space-y-1" {...props}>
                {children}
              </ol>
            );
          },
          li({ children, ...props }) {
            return <li {...props}>{children}</li>;
          },
          pre({ children, ...props }) {
            return <pre {...props}>{children}</pre>;
          },
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-2 pl-3" {...props}>
                {children}
              </blockquote>
            );
          },
          hr(props) {
            return <hr className="my-0" {...props} />;
          },
          strong({ children, ...props }) {
            return (
              <strong className="font-medium" {...props}>
                {children}
              </strong>
            );
          },
          a({ href, children, ...props }) {
            const safe = isSafeHref(href);
            if (!safe) {
              // Render as plain text if href is unsafe
              return <span {...props}>{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="underline text-primary"
                {...props}
              >
                {children}
              </a>
            );
          },
          // Limit which elements render by returning their children
          h1({ children }) {
            return <p>{children}</p>;
          },
          h2({ children }) {
            return <p>{children}</p>;
          },
          h3({ children }) {
            return <p>{children}</p>;
          },
        }}
        allowedElements={[...allowed] as unknown as string[]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default SafeMarkdown;
