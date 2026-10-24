import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const heading = 'mb-1.5 text-[15px] font-semibold';

/** Links open in a new tab, without giving the new page a handle on this one. */
const ExternalLink = ({ href, children }: Props & Readonly<{ href?: string | undefined }>) => (
  <a
    href={href}
    className="text-(--ee-blue-600) underline hover:text-(--ee-blue-700)"
    target="_blank"
    rel="noopener noreferrer"
  >
    {children}
  </a>
);
const list = 'mb-2.5 pl-5 [&>li]:my-0.5';

type Props = Readonly<{ children?: ReactNode }>;

// v2's Markdown: 14/22 body text, 15px/600 headings, 10px between blocks, mono inline code on
// slate 100. Only the children are passed on (not react-markdown's `node` or other props), and
// raw HTML is never rendered (TECH_STACK: sanitized at render time).
const components: Components = {
  h1: ({ children }: Props) => <h3 className={heading}>{children}</h3>,
  h2: ({ children }: Props) => <h3 className={heading}>{children}</h3>,
  h3: ({ children }: Props) => <h3 className={heading}>{children}</h3>,
  h4: ({ children }: Props) => <h4 className={heading}>{children}</h4>,
  p: ({ children }: Props) => <p className="mb-2.5">{children}</p>,
  ul: ({ children }: Props) => <ul className={`list-disc ${list}`}>{children}</ul>,
  ol: ({ children }: Props) => <ol className={`list-decimal ${list}`}>{children}</ol>,
  strong: ({ children }: Props) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }: Props) => (
    <code className="bg-(--slate-100) px-[5px] py-px font-mono text-[12.5px]">{children}</code>
  ),
  a: ({ children, href }: Props & Readonly<{ href?: string | undefined }>) => (
    <ExternalLink href={href}>{children}</ExternalLink>
  ),
  // Images become links (9.4 decision 2): nothing is fetched from an author's address until
  // someone clicks. A `src` the sanitizer removed (not http or https) leaves the alt text.
  img: ({ src, alt }: Readonly<{ src?: string | Blob | undefined; alt?: string | undefined }>) => {
    const label = alt || (typeof src === 'string' ? src : '');
    return typeof src === 'string' && src ? (
      <ExternalLink href={src}>{label}</ExternalLink>
    ) : (
      <span>{label}</span>
    );
  },
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

/** Stored Markdown (interview notes, reasons, later feedback), rendered sanitized. */
export const Markdown = ({ children }: Readonly<{ children: string }>) => (
  <div className="text-sm leading-[22px] text-foreground [&>*:last-child]:mb-0">
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {children}
    </ReactMarkdown>
  </div>
);
