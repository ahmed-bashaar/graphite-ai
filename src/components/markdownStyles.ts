/**
 * Tailwind classes for the HTML `renderMarkdown` produces. Preflight resets
 * element styles, so lists, headings, tables etc. are styled here.
 */
export const markdownStyles = [
  '[&_p+*]:mt-2 [&_*+p]:mt-2',
  '[&_h3]:mt-3 [&_h3]:font-semibold [&_h4]:mt-2 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-500',
  '[&_hr]:my-3 [&_hr]:border-zinc-300 dark:[&_hr]:border-zinc-700',
  '[&_a]:underline [&_a]:underline-offset-2',
  '[&_code]:rounded [&_code]:bg-zinc-200/70 [&_code]:px-1 [&_code]:text-[0.9em] dark:[&_code]:bg-zinc-800',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-sm [&_pre]:text-zinc-100',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:my-1 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border [&_th]:border-zinc-300 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left dark:[&_th]:border-zinc-700',
  '[&_td]:border [&_td]:border-zinc-300 [&_td]:px-2 [&_td]:py-1 dark:[&_td]:border-zinc-700',
].join(' ')
