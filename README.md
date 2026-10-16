# Bitcoin Wealth — starter website

This is a runnable starter project with:
- Registration and login (name, email, password; login with email/password)
- Separate user dashboards
- Clearly labelled simulated Bitcoin chart
- Admin dashboard to edit recorded investment/earnings figures
- Admin-entered credit/debit transaction history with an audit trail
- Editable Bitcoin wallet display address
- Optional Tawk.to live chat widget configured from the admin dashboard

## Important use and financial transparency
This starter is not a licensed investment service and does not verify blockchain payments or execute trades. The chart is simulated. Admin-edited figures and credit/debit records are displayed as administrator-entered records and are not proof that money was received or that profits were earned. Do not advertise guaranteed returns or present demo data as real trading performance. Before accepting real funds, get appropriate legal/compliance advice and add reliable payment verification and security review.

## Requirements
- Node.js 20 or newer
- npm

## Run locally
1. Extract this folder.
2. Copy `.env.example` to `.env`.
3. Set `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env` to strong, unique values.
4. In this folder, run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000`.

The admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the server starts. Keep the `.env` file private.

## Add Tawk.to
1. Create/sign in to your account at https://www.tawk.to/
2. In the Tawk.to dashboard, create a property for your website.
3. Open Administration / Channels / Chat Widget (the labels may vary), then copy the Property ID and Widget ID from the widget embed code. The embed URL looks like:
   `https://embed.tawk.to/PROPERTY_ID/WIDGET_ID`
4. Sign in to Bitcoin Wealth as the admin.
5. Open **Admin → Site settings**, paste the Property ID and Widget ID, and save.
6. Reload the site. The chat widget should appear. Test it in a private/incognito window.

You can also leave these fields blank to disable the chat widget. Never paste Tawk.to account passwords or API secrets into this website.

## Deployment so anyone can access it
This folder is the website source, not a published website. To make it accessible worldwide:
1. Choose a Node.js hosting provider that supports persistent storage and HTTPS.
2. Upload the project or connect its private Git repository.
3. Configure the environment variables from `.env.example` in the host's settings.
4. Use a persistent disk/volume for the SQLite database, or move the database to managed PostgreSQL before scaling to multiple server instances.
5. Connect a domain you own, enable HTTPS, and test registration, login, admin access, backups, and chat.
6. In Google Search Console, add your domain and submit its sitemap once the site is live. Google indexing is not immediate or guaranteed.

## Security notes before public launch
- Use HTTPS only.
- Use a strong, unique admin password and session secret.
- Back up the database securely.
- Review applicable financial, privacy, consumer-protection, and tax rules before handling real customer funds.
- This starter uses SQLite for a small initial deployment. For high traffic, multiple instances, or real financial operations, use managed PostgreSQL and a professional security review.
