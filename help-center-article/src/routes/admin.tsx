import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { CATEGORIES } from '../lib/config'
import type { Article } from '../lib/vectors.server'

const loadAdmin = createServerFn().handler(async () => {
  const { currentAuthor } = await import('../lib/auth.server')
  const author = await currentAuthor()
  if (!author) return { author: null, articles: [] as Article[] }

  const { listArticles } = await import('../lib/vectors.server')
  return { author, articles: await listArticles() }
})

const signInFn = createServerFn({ method: 'POST' })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { signIn } = await import('../lib/auth.server')
    try {
      await signIn(data.email, data.password)
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof Error
            ? error.message
            : 'Those details did not match an account.',
      }
    }
  })

const signOutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { signOut } = await import('../lib/auth.server')
  await signOut()
})

const requireAuthor = async () => {
  const { currentAuthor } = await import('../lib/auth.server')
  const author = await currentAuthor()
  if (!author) throw redirect({ to: '/admin' })
}

const saveArticle = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      id?: string
      title: string
      body: string
      category: string
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAuthor()
    const { createArticle, updateArticle } = await import(
      '../lib/vectors.server'
    )
    return data.id
      ? updateArticle(data.id, data)
      : createArticle(data)
  })

const removeArticle = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await requireAuthor()
    const { deleteArticle } = await import('../lib/vectors.server')
    await deleteArticle(data.id)
  })

export const Route = createFileRoute('/admin')({
  loader: () => loadAdmin(),
  component: Admin,
})

function Admin() {
  const { author, articles } = Route.useLoaderData()
  return author ? (
    <Workbench author={author} articles={articles} />
  ) : (
    <SignIn />
  )
}

function SignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await signInFn({ data: { email, password } })
    setBusy(false)
    if (result.ok) router.invalidate()
    else setError(result.message)
  }

  return (
    <main className="mx-auto max-w-sm px-6 pb-24 pt-24">
      <p className="eyebrow text-rust">Authoring</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
        Sign in to publish
      </h1>
      <p className="mt-3 text-sm text-dust">
        Articles are embedded as they are saved, so a new answer is searchable
        the moment you publish it.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border-b border-edge bg-transparent py-2 text-chalk transition-colors focus:border-rust focus:outline-none"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border-b border-edge bg-transparent py-2 text-chalk transition-colors focus:border-rust focus:outline-none"
          />
        </Field>

        {error && (
          <p className="font-mono text-xs text-rust" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-rust py-2.5 font-mono text-xs uppercase tracking-widest text-void transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

type Draft = { id?: string; title: string; body: string; category: string }

const emptyDraft: Draft = { title: '', body: '', category: CATEGORIES[0] }

function Workbench({
  author,
  articles,
}: {
  author: { name: string; email: string }
  articles: Article[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    await saveArticle({ data: draft })
    setDraft(emptyDraft)
    setBusy(false)
    router.invalidate()
  }

  const remove = async (id: string) => {
    await removeArticle({ data: { id } })
    if (draft.id === id) setDraft(emptyDraft)
    router.invalidate()
  }

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
      <div className="flex items-start justify-between gap-6 border-b border-edge pb-6">
        <div>
          <p className="eyebrow text-rust">Authoring</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
            {articles.length} articles published
          </h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs text-dust">{author.email}</p>
          <button
            onClick={async () => {
              await signOutFn()
              router.invalidate()
            }}
            className="mt-2 font-mono text-xs uppercase tracking-widest text-dust transition-colors hover:text-rust"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_340px]">
        <form onSubmit={save}>
          <p className="eyebrow">
            {draft.id ? 'Editing article' : 'New article'}
          </p>

          <input
            required
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            placeholder="Title"
            className="mt-4 w-full border-b border-edge bg-transparent pb-2 font-display text-2xl font-semibold text-chalk placeholder:text-dust/50 focus:border-rust focus:outline-none"
          />

          <div className="mt-5 flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setDraft({ ...draft, category })}
                className={`border px-3 py-1 font-mono text-xs transition-colors ${
                  draft.category === category
                    ? 'border-rust text-rust'
                    : 'border-edge text-dust hover:text-chalk'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <textarea
            required
            rows={12}
            value={draft.body}
            onChange={(event) =>
              setDraft({ ...draft, body: event.target.value })
            }
            placeholder="Write the answer the way you would say it out loud. Separate paragraphs with a blank line."
            className="mt-5 w-full resize-y border border-edge bg-graphite/50 p-4 text-sm leading-relaxed text-chalk placeholder:text-dust/50 focus:border-rust focus:outline-none"
          />

          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={busy}
              className="bg-rust px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-void transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Embedding' : draft.id ? 'Save changes' : 'Publish'}
            </button>
            {draft.id && (
              <button
                type="button"
                onClick={() => setDraft(emptyDraft)}
                className="font-mono text-xs uppercase tracking-widest text-dust hover:text-chalk"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <aside>
          <p className="eyebrow border-b border-edge pb-3">Published</p>
          {articles.length === 0 ? (
            <p className="mt-4 text-sm text-dust">
              Nothing published yet. The first article you save becomes
              searchable straight away.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-edge/60">
              {articles.map((article) => (
                <li key={article.id} className="py-3">
                  <p className="font-mono text-[0.625rem] uppercase tracking-widest text-dust">
                    {article.metadata.category}
                  </p>
                  <p className="mt-1 text-sm text-chalk">
                    {article.metadata.title}
                  </p>
                  <div className="mt-2 flex gap-4">
                    <button
                      onClick={() =>
                        setDraft({
                          id: article.id,
                          title: article.metadata.title,
                          body: article.metadata.body,
                          category: article.metadata.category,
                        })
                      }
                      className="font-mono text-[0.6875rem] uppercase tracking-widest text-dust hover:text-rust"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(article.id)}
                      className="font-mono text-[0.6875rem] uppercase tracking-widest text-dust hover:text-rust"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  )
}
