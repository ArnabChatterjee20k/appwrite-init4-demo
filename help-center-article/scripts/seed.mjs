/**
 * Publishes the starter help center content.
 *
 * Run once against an empty collection: `pnpm seed`
 */
const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1'
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID
const API_KEY = process.env.APPWRITE_API_KEY
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? 'helpcenter'
const COLLECTION_ID = process.env.APPWRITE_COLLECTION_ID ?? 'articles'

const EMBEDDING_MODEL = 'all-minilm'

const headers = {
  'content-type': 'application/json',
  'x-appwrite-project': PROJECT_ID,
  'x-appwrite-key': API_KEY,
}

async function call(method, path, body) {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(payload.message ?? response.status)
  return payload
}

async function embed(texts) {
  const result = await call('POST', '/embeddings/text', {
    texts,
    model: EMBEDDING_MODEL,
  })
  return result.embeddings.map((entry) => {
    if (entry.error) throw new Error(entry.error)
    return entry.embedding
  })
}

const articles = [
  {
    category: 'Account',
    title: 'Resetting a password you no longer remember',
    body: `Select "Forgot password" on the sign in screen and enter the address you use for Meridian. The reset link stays valid for one hour and can only be opened once.

If the email does not arrive within a few minutes, check whether your studio uses a shared inbox with filtering rules. Reset mail is sent from no-reply@meridian.app and is often caught by rules that route automated mail into an archive folder.

Once the new password is set, every other signed-in device is logged out. That is deliberate, and it is the fastest way to remove access from a laptop you no longer have.`,
  },
  {
    category: 'Account',
    title: 'Turning on two-factor authentication',
    body: `Open Settings, then Security, and choose "Add authenticator". Meridian shows a QR code that any TOTP app can read, including 1Password, Bitwarden, and Google Authenticator.

Save the eight recovery codes somewhere that is not the same device as the authenticator. Each code works once, and they are the only route back into the account if you lose the phone.

Studio owners can require two-factor for everyone from Settings, then Members. Existing members are prompted to enrol the next time they sign in rather than being locked out immediately.`,
  },
  {
    category: 'Billing',
    title: 'What to do when a card payment is declined',
    body: `A decline is almost always the bank rather than Meridian. Open Billing, then Payment method, and check that the expiry date and billing postcode match the card exactly.

Meridian retries a failed charge three times over six days. The account keeps working during that window, and you will see a banner with the date of the next attempt. Nothing is locked until the final retry fails.

If the retries do not succeed, adding a different card and choosing "Retry now" settles the balance immediately without waiting for the next cycle.`,
  },
  {
    category: 'Billing',
    title: 'Downloading invoices for your accountant',
    body: `Every charge produces a PDF invoice under Billing, then History. Use "Download all" to export a date range as a single zip, which is usually what an accountant wants at the end of a quarter.

Invoices show your studio name and address as entered in Billing, then Details. Changing those details updates future invoices only, so correct them before the next cycle rather than after.

If you need a VAT or GST number on the document, add it in the same panel. Meridian re-issues the current month's invoice automatically once the number is saved.`,
  },
  {
    category: 'Projects',
    title: 'Archiving a project without losing its history',
    body: `Archiving hides a project from the sidebar and stops new time being logged against it, while keeping every entry, comment, and attachment intact.

Open the project, choose Actions, then Archive. Archived work still appears in reports when you tick "Include archived", so quarterly totals stay accurate.

Restoring is immediate and has no side effects. Deleting, by contrast, removes the time entries permanently and cannot be undone, so archive unless you genuinely need the data gone.`,
  },
  {
    category: 'Projects',
    title: 'Fixing time logged to the wrong project',
    body: `Open the entry from the timesheet, select the project field, and pick the correct one. The change is applied to that entry alone.

To move a run of entries at once, filter the timesheet by date and project, tick the rows, and choose "Move to project". Meridian recalculates any affected invoice drafts as soon as the move completes.

Entries that already sit on a sent invoice are locked. Void the invoice first, move the time, then re-issue, so the client only ever sees one correct document.`,
  },
  {
    category: 'Invoicing',
    title: 'Setting a different hourly rate for one client',
    body: `Rates cascade from the studio default, to the client, to the individual project, and the most specific one wins.

Open the client, choose Rates, and set the figure there to override the studio default for all of that client's work. For a single piece of work priced differently, set the rate on the project instead.

Changing a rate never rewrites time that has already been invoiced. Existing drafts are recalculated, and anything already sent stays exactly as the client received it.`,
  },
  {
    category: 'Invoicing',
    title: 'Sending a reminder for an overdue invoice',
    body: `Meridian marks an invoice overdue the day after its due date and shows it in red on the dashboard.

Open the invoice and choose "Send reminder" to email the contact with the original PDF attached. You can edit the message before it goes, which is worth doing for a long-standing client.

Automatic reminders are off by default. Turn them on under Invoicing, then Reminders, and choose the schedule, commonly three days after the due date and again at fourteen.`,
  },
  {
    category: 'Integrations',
    title: 'Connecting Meridian to your calendar',
    body: `Under Integrations, choose Calendar and connect a Google or Microsoft account. Meridian reads event titles and times so you can turn a meeting into a time entry with one click.

Nothing is written back to the calendar and no entry is created automatically. Suggested entries sit in a tray on the timesheet until you accept them.

Disconnecting removes the stored token straight away. Time entries you already accepted stay where they are, since by then they are ordinary Meridian data.`,
  },
  {
    category: 'Integrations',
    title: 'Exporting time data to a spreadsheet',
    body: `Any report can be exported as CSV from the Export button at the top right, including the filters currently applied.

The export contains one row per time entry with the project, client, member, duration in decimal hours, and billable flag. Decimal hours are used rather than hh:mm because spreadsheets sum them correctly without extra formatting.

For a recurring export, save the report first. A saved report keeps its filters, so the monthly export is one click rather than a rebuild each time.`,
  },
]

const main = async () => {
  const vectors = await embed(
    articles.map((article) => `${article.title}\n\n${article.body}`),
  )

  for (const [index, article] of articles.entries()) {
    await call(
      'POST',
      `/vectorsdb/${DATABASE_ID}/collections/${COLLECTION_ID}/documents`,
      {
        documentId: 'unique()',
        data: {
          embeddings: vectors[index],
          metadata: {
            title: article.title,
            body: article.body,
            category: article.category,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    )
    console.log(`published: ${article.title}`)
  }

  console.log(`\n${articles.length} articles published.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
