import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { ProximityRuler, RulerAxis } from '../components/ProximityRuler'
import type { Article } from '../lib/vectors.server'

const loadHome = createServerFn()
  .validator((data: { q?: string }) => data)
  .handler(async ({ data }) => {
    const { listArticles, searchArticles } = await import(
      '../lib/vectors.server'
    )
    const question = data.q?.trim() ?? ''

    if (!question) {
      return { question, results: null, catalog: await listArticles() }
    }

    return { question, results: await searchArticles(question), catalog: null }
  })

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => loadHome({ data: { q: deps.q } }),
  component: Home,
})

const snippet = (body: string, length = 150) =>
  body.length > length ? `${body.slice(0, length).trimEnd()}…` : body

function Home() {
  const { question, results, catalog } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/' })
  const [draft, setDraft] = useState(question)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const q = draft.trim()
    navigate({ to: '/', search: { q: q || undefined } })
  }

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
      <div className="max-w-2xl">
        <p className="eyebrow">Ask in your own words</p>
        <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
          What do you need
          <br />
          to sort out?
        </h1>
        <p className="mt-5 max-w-lg text-dust">
          Search matches on meaning, so you do not have to guess the wording we
          filed an answer under.
        </p>
      </div>

      <form onSubmit={submit} className="mt-10 max-w-2xl">
        <label htmlFor="q" className="sr-only">
          Your question
        </label>
        <div className="flex items-center gap-4 border-b-2 border-edge pb-3 transition-colors focus-within:border-verdigris">
          <input
            id="q"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="My card was declined, what now?"
            className="w-full bg-transparent font-display text-xl font-medium text-chalk placeholder:text-dust/60 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 font-mono text-xs uppercase tracking-widest text-verdigris transition-opacity hover:opacity-70"
          >
            Search
          </button>
        </div>
      </form>

      {results ? (
        <Results question={question} results={results} />
      ) : (
        <Catalog articles={catalog ?? []} />
      )}
    </main>
  )
}

function Results({
  question,
  results,
}: {
  question: string
  results: Article[]
}) {
  if (results.length === 0) {
    return (
      <section className="mt-16 border-t border-edge pt-8">
        <p className="font-display text-2xl font-semibold">
          Nothing filed on that yet
        </p>
        <p className="mt-3 max-w-md text-dust">
          Try describing the problem instead of the feature, or{' '}
          <Link to="/" search={{ q: undefined }} className="text-verdigris hover:underline">
            browse every article
          </Link>
          .
        </p>
      </section>
    )
  }

  return (
    <section className="mt-16">
      <div className="flex items-end justify-between border-b border-edge pb-3">
        <p className="eyebrow">
          {results.length} answers ranked for &ldquo;{question}&rdquo;
        </p>
        <RulerAxis />
      </div>

      <ol>
        {results.map((article, index) => (
          <li key={article.id} className="rise" style={{ animationDelay: `${index * 40}ms` }}>
            <Link
              to="/article/$id"
              params={{ id: article.id }}
              className="flex items-start gap-8 border-b border-edge/60 py-6 transition-colors hover:bg-graphite/60"
            >
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{article.metadata.category}</p>
                <h2 className="mt-2 font-display text-xl font-semibold text-chalk">
                  {article.metadata.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-dust">
                  {snippet(article.metadata.body)}
                </p>
              </div>
              <ProximityRuler similarity={1 - (article.distance ?? 1)} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Catalog({ articles }: { articles: Article[] }) {
  if (articles.length === 0) {
    return (
      <section className="mt-16 border-t border-edge pt-8">
        <p className="font-display text-2xl font-semibold">
          The help center is empty
        </p>
        <p className="mt-3 max-w-md text-dust">
          Sign in to{' '}
          <Link to="/admin" className="text-rust hover:underline">
            authoring
          </Link>{' '}
          to publish the first article.
        </p>
      </section>
    )
  }

  const byCategory = new Map<string, Article[]>()
  for (const article of articles) {
    const list = byCategory.get(article.metadata.category) ?? []
    list.push(article)
    byCategory.set(article.metadata.category, list)
  }

  return (
    <section className="mt-16">
      <p className="eyebrow border-b border-edge pb-3">
        Everything we have filed
      </p>
      <div className="mt-8 grid gap-10 sm:grid-cols-2">
        {[...byCategory.entries()].map(([category, list]) => (
          <div key={category}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-verdigris">
              {category}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {list.map((article) => (
                <li key={article.id}>
                  <Link
                    to="/article/$id"
                    params={{ id: article.id }}
                    className="text-chalk transition-colors hover:text-verdigris"
                  >
                    {article.metadata.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
