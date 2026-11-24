# Weekend Backyard BBQ — Bilingual Pre-Order & Admin App

Mobile-first English (LTR) & Farsi (RTL) pre-order storefront and Admin Back Panel built with **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **PostgreSQL (Neon)**, and **Stripe Checkout**. Completely migrated off Firebase for rock-solid atomic inventory/time-slot reservations and zero-hassle Vercel deployments.

## Key Features
- **Bilingual Mobile-First Storefront (`/`)**: Seamless English (LTR) & Farsi (`Vazirmatn`, RTL) switching, pickup date cards with 9:00 PM day-before Calgary cutoff, menu & dessert sections (desserts never consume grill time slots), Available/Full time-slot pills, and sticky mobile checkout bar.
- **Stripe Checkout Primary Payment + Optional e-Transfer Toggle**: Atomic server-side stock & slot reservation before redirecting to Stripe Checkout (`CAD`), verified via Stripe Webhooks (`/api/webhooks/stripe`) and `/order/success`, with automatic reservation release on cancellation or expiry. Admin can switch between **Stripe Only**, **Hybrid (Stripe + e-Transfer)**, or **Manual e-Transfer**.
- **Refined Admin Back Panel (`/admin`)**: Signed HTTP-only cookie authentication (no Firebase Auth conflicts), Store Open / Maintenance toggles, pickup date manager, per-date stock & per-item time-slot limits with live usage bars & capacity validation, bilingual Menu CRUD, order status pipeline, CSV export, print kitchen sheet, and single/bulk order deletion with automatic stock & slot restoration.

## Local Development
```bash
cp .env.example .env.local
npm install
npm run dev
```
- Storefront: `http://localhost:3000`
- Admin Panel: `http://localhost:3000/admin` (defaults in `.env.local` if unset: `weekendbackyardbbq@gmail.com` / `admin123`)
- If `DATABASE_URL` is blank locally, data is automatically stored in `.data/dev-store.json`.

## Deploying to Vercel + Neon Postgres + Stripe
1. **Import repo in Vercel**: Go to [vercel.com/new](https://vercel.com/new) and import `aidinvm/Persian-bbq-`.
2. **Add Neon Postgres (Free Tier)**: In your Vercel project → **Storage** → **Create Database** → **Neon (Serverless Postgres)**. Vercel automatically injects `DATABASE_URL` (`POSTGRES_URL`). All tables and initial menu/schedule seed automatically on first request!
3. **Add Environment Variables** in Vercel → **Settings** → **Environment Variables**:
   - `NEXT_PUBLIC_APP_URL` = `https://your-project.vercel.app` (or custom domain)
   - `STRIPE_SECRET_KEY` = `sk_live_...` (or `sk_test_...` while testing)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
   - `ADMIN_EMAIL` = `weekendbackyardbbq@gmail.com`
   - `ADMIN_PASSWORD` = `<strong-password>`
   - `SESSION_SECRET` = `<random-32+-char-string>`
   - `SMTP_HOST` = `smtp.gmail.com`, `SMTP_PORT` = `587`, `SMTP_USER` = `weekendbackyardbbq@gmail.com`, `SMTP_PASS` = `<16-char Gmail App Password>`, `OWNER_NOTIFICATION_EMAIL` = `weekendbackyardbbq@gmail.com`
4. **Configure Stripe Webhook**:
   - In Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
   - Endpoint URL: `https://your-domain.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`
   - Copy the Signing Secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.
