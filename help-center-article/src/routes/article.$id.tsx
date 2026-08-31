import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const loadArticle = createServerFn()
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getArticle, searchArticles } = await import('../lib/vectors.server')
    const article = await getArticle(data.id)

    // The title is the sharper query here. Embedding the whole body pulls the
    // vector towards the average of the corpus, and everything scores alike.
    const neighbours = (
      await searchArticles(article.metadata.title, 4)
    ).filter((candidate) => candidate.id !== article.id)

    return { article, neighbours: neighbours.slice(0, 3) }
  })

export const Route = createFileRoute('/article/$id')({
  loader: ({ params }) => loadArticle({ data: { id: params.id } }),
  component: ArticlePage,
})

function ArticlePage() {
  const { article, neighbours } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-16">
      <Link to="/" search={{ q: undefined }} className="font-mono text-xs uppercase tracking-widest text-dust transition-colors hover:text-verdigris"
      >
        ← All answers
      </Link>

      <article className="mt-10">
        <p className="eyebrow text-verdigris">{article.metadata.category}</p>
        <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight">
          {article.metadata.title}
        </h1>
        <div className="mt-8 space-y-5 text-[1.0625rem] leading-relaxed text-chalk/90">
          {article.metadata.body.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <p className="mt-10 font-mono text-xs text-dust">
          Updated {new Date(article.metadata.updatedAt).toLocaleDateString()}
        </p>
      </article>

      {neighbours.length > 0 && (
        <section className="mt-16 border-t border-edge pt-8">
          <p className="eyebrow">Closest related answers</p>
          <ul className="mt-5 space-y-3">
            {neighbours.map((neighbour) => (
              <li key={neighbour.id}>
                <Link
                  to="/article/$id"
                  params={{ id: neighbour.id }}
                  className="flex items-baseline justify-between gap-6 text-chalk transition-colors hover:text-verdigris"
                >
                  <span>{neighbour.metadata.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-dust">
                    {(1 - (neighbour.distance ?? 1)).toFixed(3)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
