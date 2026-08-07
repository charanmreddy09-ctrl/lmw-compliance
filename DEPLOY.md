# Deploying GCMP (blank template)

Two environment variables, one database. Nothing else.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Any PostgreSQL 14+ connection string |
| `AUTH_SECRET` | yes | Long random string, 32+ characters. Signs session cookies. |
| `CRON_SECRET` | yes | Any random string. Without it, the two daily Vercel Crons (due-date sync, escalation matrix — see `vercel.json`) get rejected with 401 every single run, silently, forever. Set it in Vercel's Environment Variables; Vercel then signs its cron requests with it automatically. |
| `SEED_PASSWORD` | no | Initial password for seeded accounts. Defaults to `ChangeMe@2026`. |
| `ORG_NAME` | no | Display name shown in the app header/sign-in screen. Defaults to `Your Company Name`. |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Local

```bash
npm install
# write .env.local with DATABASE_URL and AUTH_SECRET
npm run db:setup
npm run dev            # http://localhost:3000
```

No PostgreSQL locally? Use a free Supabase project and point `DATABASE_URL` at
it — the setup script runs perfectly well over the network.

---

## Supabase + Vercel

### 1. Database

Create a Supabase project. In the dashboard: **Project Settings → Database →
Connection string → URI**.

Use the **connection pooler** string on port **6543**, not 5432. Serverless
functions open many short-lived connections and the pooler is what handles that
properly:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Replace `<password>` with your actual database password. If it contains
characters like `@`, `#`, `/` or `?`, URL-encode them.

### 2. Load the schema

From your machine, with `.env.local` pointing at Supabase:

```bash
npm run db:setup
```

For a real go-live, load the master data without the demonstration register:

```bash
npm run db:setup -- --empty
```

That creates the schema, countries, jurisdictions, divisions, entities, roles,
users and the full compliance library, but raises no obligations and attaches no
sample documents. You then upload your own due dates from the Excel templates
and the register builds itself.

### 3. Deploy

Push the project to GitHub, then in Vercel: **Add New → Project**, import the
repository, and add the environment variables before the first deploy:

```
DATABASE_URL   = <the pooler URI from step 1>
AUTH_SECRET    = <your generated secret>
CRON_SECRET    = <another random string — enables the daily crons>
```

Framework preset is detected automatically as Next.js. Deploy.

Or from the CLI:

```bash
npm i -g vercel
vercel                 # link the project
vercel env add DATABASE_URL production
vercel env add AUTH_SECRET production
vercel --prod
```

### 4. Confirm

Open the deployment URL. You should see the landing page with no login form on
it. Click **Sign in**, use `admin@yourcompany.example`. This blank template
seeds no entities or compliance library, so there is no score yet — the
dashboard will show zeros until you add jurisdictions, entities and a
compliance library (see "Filling in this template" in README.md).

To test the whole thing against the deployed instance:

```bash
SMOKE_BASE=https://your-app.vercel.app npm run smoke
```

---

## Other hosts

The application is a standard Next.js server — anything that runs Node 18.17+
will serve it.

```bash
npm ci
npm run build
npm start          # honours PORT, defaults to 3000
```

Works on Railway, Render, Fly.io, AWS Amplify, Azure App Service or your own VM
behind nginx. Only `DATABASE_URL` and `AUTH_SECRET` are needed. SSL is enabled
automatically for any non-localhost database host.

Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm","start"]
```

---

## Going live properly

Before this carries real filings:

1. **Seed empty.** `npm run db:setup -- --empty` — no demonstration data.
2. **Change every password.** Seeded accounts share one password. Reset each one
   from Administration → Users; accounts are flagged to force a change at first
   sign-in.
3. **Add your real users.** Only one account is seeded —
   `admin@yourcompany.example`. Create the rest from your team's actual email
   addresses in Administration -> Users (or `db/org.ts`), and rename or
   disable the seeded admin account once you have a real administrator set up.
4. **Have advisers verify the library.** Every compliance carries a `verified`
   flag, false by default. Ask each country's adviser to confirm their set and
   mark it verified in the application.
5. **Upload real due dates** from the per-country Excel templates.
6. **Rotate `AUTH_SECRET`** to a value never used in testing. Changing it later
   signs everyone out, which is harmless.
7. **Turn on database backups.** Supabase includes daily backups on paid plans.
   The evidence documents live in Postgres, so a database backup is a complete
   backup.
8. **Confirm the daily crons are actually running.** Set `CRON_SECRET` in Vercel
   (see the table above) — without it both crons 401 forever with nothing
   visible to tell you. A day after deploy, check Administration → Audit trail
   for `duedate.sync` and `escalation.run` entries attributed to `system`. No
   entries after 24h means `CRON_SECRET` isn't set, or Vercel Crons aren't
   enabled for the project's plan.

---

## If something is wrong

**"Cannot reach the database. Check DATABASE_URL."**
Wrong host, wrong password, or the URL-encoding of a special character in the
password. On Supabase confirm you used the pooler URI on port 6543.

**"The database schema is not installed. Run: npm run db:setup"**
Exactly that. The application is talking to an empty database.

**Sign-in rejects a correct password**
`AUTH_SECRET` differs between where you seeded and where you are running, or the
account is still `pending`. Approve it in Administration → Users.

**An upload is refused**
Documents are capped at 4 MB each, and only PDF, Excel, Word, ZIP, CSV and image
files are accepted. Executables are always refused. Uploading the same file
twice to the same obligation is refused by checksum — that is intended.

**Connection limits under load**
Use the pooler URI. The application already keeps a single warm pool per
serverless instance.
