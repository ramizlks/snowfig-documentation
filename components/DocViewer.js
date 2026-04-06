import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import Link from 'next/link';

export default function DocViewer({ content }) {
  const components = {
    a: ({node, href, children, ...props}) => {
      // Local document cross-linking
      if (href && href.endsWith('.md')) {
        let slug = href.replace('./', '').replace('.md', '');
        if (slug === 'README') {
          return <Link href="/">{children}</Link>;
        }
        return <Link href={`/docs/${slug}`}>{children}</Link>;
      }
      if (href && href.startsWith('#')) {
        return <a href={href} {...props}>{children}</a>;
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    },
    table: ({node, ...props}) => (
      <div className="doc-table-wrapper">
        <table {...props} />
      </div>
    ),
    blockquote: ({node, children, ...props}) => {
      const text = String(children[1]?.props?.children || children);
      let type = "info";
      let cleanChildren = children;

      if (text.includes('[!IMPORTANT]')) { type = "important"; cleanChildren = text.replace('[!IMPORTANT]', ''); }
      else if (text.includes('[!WARNING]')) { type = "warning"; cleanChildren = text.replace('[!WARNING]', ''); }
      else if (text.includes('[!NOTE]') || text.includes('[!TIP]')) { type = "note"; cleanChildren = text.replace(/\[!(NOTE|TIP)\]/, ''); }
      
      if (['important', 'warning', 'note'].includes(type) && text.includes('[!')) {
        return (
          <div className={`custom-alert alert-${type}`}>
            <strong>{type.toUpperCase()}</strong>
            <div style={{ margin: 0 }}>{cleanChildren}</div>
          </div>
        );
      }
      return <blockquote className="custom-blockquote" {...props}>{children}</blockquote>;
    },
    pre: ({node, children, ...props}) => (
      <div className="doc-code-block">
        <pre {...props}>{children}</pre>
      </div>
    ),
    code: ({node, inline, className, children, ...props}) => {
      if (inline) {
        return <code className="inline-code" {...props}>{children}</code>;
      }
      return <code className={className} {...props}>{children}</code>;
    }
  };

  return (
    <div className="snowfig-doc-viewer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
