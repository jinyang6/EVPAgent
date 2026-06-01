import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import { minimalSanitizeSchema } from '@/lib/sanitizeSchema'
import 'katex/dist/katex.min.css'
import { CopyButton } from '@/components/ui/copy-button'
import { extractImageName } from '@/utils/imageDownload'
import { preprocessContent } from '@/utils/contentPreprocessor'

// ─── Simple function components for react-markdown ───────────────────────────

const CodeComponent = (props) => {
  const { inline, className, children, ref, ...rest } = props
  if (inline) {
    return (
      <code className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono border border-gray-300 dark:border-gray-600" {...rest}>
        {children}
      </code>
    )
  }
  return (
    <code className={className || ''} {...rest}>
      {children}
    </code>
  )
}

const PreComponent = (props) => {
  const { ref, children, ...rest } = props

  const getCodeText = () => {
    if (typeof children === 'string') return children
    if (children?.props?.children) {
      if (typeof children.props.children === 'string') {
        return children.props.children
      }
      if (Array.isArray(children.props.children)) {
        return children.props.children.join('')
      }
    }
    return ''
  }

  const codeText = getCodeText()

  return (
    <div className="relative group my-4">
      <pre className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-4 pr-12 rounded-lg overflow-x-auto max-w-full border border-gray-300 dark:border-gray-700" {...rest}>
        {children}
      </pre>
      {codeText && (
        <div className="absolute top-2 right-2">
          <CopyButton text={codeText} className="bg-background/90 hover:bg-background shadow-md border" />
        </div>
      )}
    </div>
  )
}

const createRefSafeComponent = (Tag) => (props) => {
  const { ref, node, ...rest } = props
  return <Tag {...rest} />
}

// ─── MemoizedMarkdownContent ──────────────────────────────────────────────────

export const MemoizedMarkdownContent = memo(({ content, onImageClick }) => {
  const processedContent = preprocessContent(content)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        rehypeKatex,
        [rehypeSanitize, minimalSanitizeSchema]
      ]}
      remarkRehypeOptions={{
        allowDangerousHtml: true
      }}
      components={{
        // ── Let prose own spacing, sizing, and color ─────────────────────────
        // p, h1-h4: prose handles margins, font-size, font-weight, and text color.
        //           No override needed — remove to avoid fighting prose defaults.
        //
        // ── Elements that need behavior or custom styling ─────────────────────
        code: CodeComponent,
        pre: PreComponent,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary/50 pl-4 italic my-[1em] text-muted-foreground">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-[1em]">
            <table className="min-w-full border-collapse border border-border">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
        th: ({ children }) => <th className="px-4 py-2 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="px-4 py-2">{children}</td>,
        a: ({ href, children, ...rest }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" {...rest}>
            {children}
          </a>
        ),
        // ── Media: clear visual separation from surrounding text ─────────────
        // Images/video get 1.5em gap — large enough to signal "this is a
        // distinct media block." Audio gets 1em — players are compact.
        hr: () => <hr className="my-[1.5em] border-t-2 border-gray-300 dark:border-gray-600" />,
        img: ({ src, alt, ...rest }) => (
          <img
            src={src}
            alt={alt || 'Image'}
            {...rest}
            className="max-w-full h-auto rounded-lg my-[1.5em] cursor-pointer hover:opacity-90 border border-border"
            onClick={() => onImageClick({ url: src, name: extractImageName(src, alt || 'markdown-image.png') })}
            onError={(e) => {
              console.error('Image failed to load. Src length:', src?.length, 'First 100 chars:', src?.substring(0, 100))
              e.target.style.display = 'none'
              e.target.insertAdjacentHTML('afterend',
                '<div class="text-sm text-red-500 p-2 border border-red-200 rounded bg-red-50">Image failed to load</div>'
              )
            }}
            loading="lazy"
          />
        ),
        div: createRefSafeComponent('div'),
        span: createRefSafeComponent('span'),
        b: createRefSafeComponent('b'),
        i: createRefSafeComponent('i'),
        strong: createRefSafeComponent('strong'),
        em: createRefSafeComponent('em'),
        video: (props) => <video controls className="w-full max-w-full rounded-lg my-[1.5em]" {...props} />,
        audio: (props) => <audio controls className="w-full my-[1em]" {...props} />,
      }}
    >
      {processedContent}
    </ReactMarkdown>
  )
}, (prevProps, nextProps) => {
  return prevProps.content === nextProps.content && prevProps.onImageClick === nextProps.onImageClick
})
