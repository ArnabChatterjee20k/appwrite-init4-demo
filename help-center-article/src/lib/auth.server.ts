import { Account, Client } from 'node-appwrite'
import { useSession } from '@tanstack/react-start/server'
import { API_KEY, ENDPOINT, PROJECT_ID } from './config'

type SessionData = { secret?: string; email?: string; name?: string }

const cookiePassword =
  process.env.SESSION_SECRET ?? 'meridian-help-center-development-secret'

export const adminSession = () =>
  useSession<SessionData>({ password: cookiePassword, name: 'meridian_admin' })

/** A client that carries the signed-in author's session rather than an API key. */
const sessionClient = (secret: string) =>
  new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setSession(secret)

export type Author = { email: string; name: string }

export async function currentAuthor(): Promise<Author | null> {
  const session = await adminSession()
  if (!session.data.secret) return null

  try {
    const account = await new Account(
      sessionClient(session.data.secret),
    ).get()
    return { email: account.email, name: account.name }
  } catch {
    // The session was revoked or expired. Clear it so the next request re-authenticates.
    await session.clear()
    return null
  }
}

export async function signIn(email: string, password: string) {
  // The session secret is only returned to a client holding an API key, so the
  // sign in call is made server side and the secret never reaches the browser.
  const account = new Account(
    new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setKey(API_KEY),
  )
  const created = await account.createEmailPasswordSession({ email, password })

  const session = await adminSession()
  await session.update({ secret: created.secret, email })
}

export async function signOut() {
  const session = await adminSession()
  const secret = session.data.secret

  if (secret) {
    try {
      await new Account(sessionClient(secret)).deleteSession({
        sessionId: 'current',
      })
    } catch {
      // Already gone on the server; the cookie still needs clearing.
    }
  }

  await session.clear()
}
