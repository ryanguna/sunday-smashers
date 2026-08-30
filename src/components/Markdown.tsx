import type { ReactNode } from 'react'

/**
 * Minimal, dependency-free Markdown → JSX renderer for the small, controlled
 * subset of Markdown used in `site_content.body_markdown` (see
 * `supabase/seed.sql`): `#`/`##` headings, `-` bullet lists, blank-line
 * paragraphs, and `**bold**` inline spans. This intentionally does not aim
 * to be a general-purpose Markdown parser — just enough to render the
 * rules/FAQ content stored in Supabase (or the hard-coded fallback) without
 * pulling in a new dependency.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>
  })
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let listBuffer: string[] = []
  let paragraphBuffer: string[] = []

  function flushList() {
    if (listBuffer.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-3 list-disc space-y-1.5 pl-6">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    )
    listBuffer = []
  }

  function flushParagraph() {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join(' ')
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-3 leading-relaxed">
        {renderInline(text, `p-${blocks.length}`)}
      </p>
    )
    paragraphBuffer = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line === '') {
      flushParagraph()
      flushList()
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-6 mb-2 text-xl font-extrabold text-[var(--color-plum)] first:mt-0">
          {renderInline(line.slice(3), `h3-${blocks.length}`)}
        </h3>
      )
      continue
    }

    if (line.startsWith('# ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-8 mb-3 text-2xl font-extrabold text-[var(--color-plum)] first:mt-0">
          {renderInline(line.slice(2), `h2-${blocks.length}`)}
        </h2>
      )
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      listBuffer.push(line.slice(2))
      continue
    }

    flushList()
    paragraphBuffer.push(line)
  }
  flushParagraph()
  flushList()

  return <div className={className}>{blocks}</div>
}
