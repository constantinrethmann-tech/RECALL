import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/** Card text: markdown (bold, lists, tables); single line breaks are kept, like in Anki. */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
