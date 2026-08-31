import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Meridian help center' },
      {
        name: 'description',
        content:
          'Answers for Meridian, the time tracking and invoicing tool for independent studios.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=JetBrains+Mono:wght@400;500&family=Public+Sans:wght@400;500;600&display=swap',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen">
        <div className="paper-grid min-h-screen">
          <header className="border-b border-edge/70">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
              <Link to="/" search={{ q: undefined }} className="group flex items-baseline gap-3">
                <span className="font-display text-lg font-extrabold tracking-tight">
                  Meridian
                </span>
                <span className="eyebrow group-hover:text-chalk">
                  Help center
                </span>
              </Link>
              <Link
                to="/admin"
                className="font-mono text-xs text-dust transition-colors hover:text-rust"
              >
                Authoring
              </Link>
            </div>
          </header>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
