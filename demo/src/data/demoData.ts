import { JsonEditorProps } from 'json-edit-react'
import { examples } from '@playground-data/examples'
import { dataEditorProps } from './dataEditorProps'

// The examples are shared with the docs site's Playground
// (fig-tree-evaluator/docs-site/src/playground/, through the
// `@playground-data` alias): each one's blurb is a Markdown file named by its
// id, whose images are referenced by relative path. Only the data editor's
// settings are the demo's own (./dataEditorProps.ts).

export interface DemoData {
  id: string
  name: string
  content: string // Markdown
  objectData?: Record<string, unknown>
  objectJsonEditorProps?: Omit<JsonEditorProps, 'data' | 'setData'>
  expression: unknown
  expressionCollapse?: number
}

const fileName = (path: string) => path.split('/').pop()!

const byFileName = (files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).map(([path, value]) => [fileName(path), value]))

const blurbs = byFileName(
  import.meta.glob<string>('@playground-data/blurbs/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
)

const images = byFileName(
  import.meta.glob<string>('@playground-data/blurbs/img/*', {
    query: '?url',
    import: 'default',
    eager: true,
  })
)

// A blurb with its images' relative paths swapped for the URLs Vite serves
// them at
const blurb = (id: string) =>
  (blurbs[`${id}.md`] ?? '').replace(
    /src="\.\/img\/([^"]+)"/g,
    (match, file: string) => (images[file] ? `src="${images[file]}"` : match)
  )

export const demoData: DemoData[] = examples.map(({ id, name, data, expression, collapse }) => ({
  id,
  name,
  content: blurb(id),
  objectData: data,
  objectJsonEditorProps: dataEditorProps[id],
  expression,
  expressionCollapse: collapse,
}))
