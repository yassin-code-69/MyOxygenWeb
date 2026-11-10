# My Oxygen — Open Issues

Status as of **10 November 2026**. The API runs on Railway and the website on Vercel ([setup](DEPLOYMENT.md#current-production-railway--vercel)). Everything below is still open. Items are grouped by when they need to be done; each says what is wrong, why it matters and how to fix it.

- 🔴 **Before going live**: blocks a public launch.
- 🟠 **Soon after launch**: important, but the store can run without it for a short time.
- 🟡 **Known limitations**: acceptable for now; improve when there is time.

For what already exists in the project, see [`PROJECT_INVENTORY.md`](PROJECT_INVENTORY.md).

---

## 🔴 Before going live

| # | Issue | Why it matters | Fix |
|---|---|---|---|
| 1 | **Development accounts with public passwords exist in the Supabase database** (`admin@`, `inventory@`, `orders@`, `marketing@`, `support@` and `customer@myoxygen.com`). | The passwords are written in the README. Anyone who reads it can sign in to the real admin panel. | Create the real owner account with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then deactivate the dev accounts (Admin → Settings → Admin Roles, or the SQL in `docs/DEPLOYMENT.md`). |
| 2 | **No "Forgot password".** | A customer or staff member who forgets their password cannot get back in, and an admin cannot reset it for them. | Add a reset flow with a one-time code sent by SMS (SSL Wireless is already integrated) and/or email. |
| 3 | **Logout does not end the session on the server.** Logout only deletes the tokens in the browser. A refresh token keeps working for 7 days, even after logout. There is no "log out of all devices". | A stolen refresh token cannot be cancelled except by deactivating the whole account. | Store sessions on the server (or a per-user token version), rotate the refresh token on every use, revoke on logout, and add "log out everywhere". |
| 4 | **Credentials that must be rotated.** The current database password is short and guessable, and the Supabase personal access token was pasted into a chat. | Weak or exposed credentials give full access to the data. | Set a long random database password in Supabase and update `backend/.env`. Revoke the access token (Supabase → Account → Access Tokens) and create a new one for tooling. |
| 5 | **The old Supabase project is compromised.** Its password and JWT secret were committed to git (`adwxwwcnxpcuwkjheqaj`, Tokyo) and stay in the git history. | Anyone with the repository history can connect to it. | Delete or pause the old project. Optionally rewrite the git history. |
| 6 | **One database is used for both development and production.** The local dev server (`bun run dev` on port 4000) runs directly against the Supabase database. | Experiments and test data land in real data, and every schema change hits production immediately. | Create a separate Supabase project (or branch) for development and point the local `.env` at it. Keep production for the live site only. |
| 7 | **Courier, SMS and email are in mock mode.** No Steadfast, SSL Wireless or Resend keys are configured. | Orders cannot be booked with the courier, and customers get no SMS or email (the logs say "skipped"). | Add the keys in production (`STEADFAST_*`, `SSL_WIRELESS_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL`) and set `COURIER_PROVIDER=steadfast`. Confirm the Steadfast base URL (it may now be `portal.packzy.com`). |
| 8 | **No Redis in production, and the Redis path is broken.** Without `REDIS_URL`, background jobs (notifications, invoice PDFs, daily digest) run in memory. BullMQ 6 needs the `ioredis` package, which is not installed, so setting `REDIS_URL` today stops every job. | Jobs waiting in the queue are lost whenever the server restarts. | Run `bun add ioredis`, add a Redis service on Railway, set `REDIS_URL` (append `?family=0` for the private URL), then test with a real order. |
| 9 | **Demo data in the live database.** It has 22 demo products, demo flash sales and coupons. Three products have broken images (Mustela Baby Skincare Set, Aveeno Baby Wash, Organic Soothing Nipple Balm). Some images don't match their product (for example a pillow on the support band). | Customers would see demo products and broken pictures. | Replace them with the real catalog through the admin panel. To keep the demo, fix the 3 images in Admin → Products → Edit. |
| 10 | **Hosting plans and the API domain are not final.** The Railway account is on the trial plan. The Vercel team is on Hobby, which Vercel limits to non-commercial use. `api.myoxygen.life` is created on Railway but has no DNS records yet, so the website uses `backend-production-f0954.up.railway.app`. | When the trial ends the API stops, and the whole store with it. | Upgrade Railway to a paid plan and Vercel to Pro. Add the two DNS records from `DEPLOYMENT.md`, then point `NEXT_PUBLIC_API_URL` at `https://api.myoxygen.life`. |

## 🟠 Soon after launch

### Accounts and security

| # | Issue | Fix |
|---|---|---|
| 11 | **No "change password"** for customers or staff. | Add it to `/account` and the admin profile menu. It should also end other sessions (needs #3). |
| 12 | **Phone numbers are not verified at registration.** Anyone can sign up with someone else's number, which encourages fake cash-on-delivery orders. | Send an SMS one-time code before the account is created, or before the first order. |
| 13 | **Tokens are stored in the browser's localStorage.** The security policy (CSP) still allows inline scripts. If the site ever has a script-injection (XSS) bug, the tokens can be stolen. | Move the refresh token to an `httpOnly` secure cookie. Later, tighten the CSP with nonces. |
| 14 | **Login rate limiting is basic.** It is 15 attempts per minute per IP, counted in server memory, so a restart resets it and several servers each keep their own count. There is no per-account lockout. | Keep the counters in Redis, and add a per-account limit (for example, slow down after 5 failed attempts). |

### Store features

| # | Issue | Fix |
|---|---|---|
| 15 | **No online payment.** Only cash on delivery works; "Online payment" is shown as unavailable. | Integrate a gateway (bKash, Nagad or SSLCommerz) and connect a webhook to the payment status. |
| 16 | **Courier status is not updated automatically.** Nothing marks a parcel DELIVERED when the courier delivers it. Also, Steadfast has no cancel API, so cancelling a shipped order needs manual confirmation. | Add a Steadfast webhook, or a polling job, that updates order status. |
| 17 | **Product images cannot be uploaded.** The admin form only accepts image URLs or `/images/...` paths. | Use Supabase Storage (already allowed in the image settings) for uploads from the product form. |
| 18 | **Which discount wins is a business decision.** A product's own sale price beats a category flash sale even when the flash sale is bigger. For example, the "Inner Wear Week −15%" banner does not lower products that already have their own sale price. The page and the charge always agree, so nobody is overcharged. | The owner decides between "most specific wins" (current) and "best price wins". |

### Operations, SEO and invoices

| # | Issue | Fix |
|---|---|---|
| 19 | **CI status is unknown** (the GitHub CLI is not signed in). The backend Docker image now builds on Railway; the frontend image has never been built, because Vercel does not use it. | Check the GitHub Actions runs on `main`. Build the frontend image once if Docker hosting is ever needed (risk: `next/font` needs internet during the build). |
| 20 | **No monitoring, staging or backup plan.** | Add error tracking (for example Sentry), a staging environment, and Supabase backups or PITR (point-in-time recovery). |
| 21 | **SEO gaps.** Product and category pages render in the browser, so unknown links return HTTP 200 (a "soft 404"). Page titles come from the URL slug, not the real product name. | Render product and category pages on the server, with real `notFound()` handling and titles from the API. |
| 22 | **Invoices cannot show Bangla text.** The PDF's built-in fonts drop Bangla characters and print "BDT" instead of ৳. | Embed a Unicode font (for example Noto Sans Bengali) in the PDF generator. |

## 🟡 Known limitations

### Features that do not exist yet

| # | Item | Note |
|---|---|---|
| 23 | **"Coming soon" admin modules:** Campaigns, Banners, Push Notifications, Content (Pages, Blog, Media), Store Settings. | They have no backend yet and show as disabled in the sidebar. |
| 24 | **Not built:** product reviews and ratings, wishlist, reward points, image search, email verification. | The UI shows no fake versions of these (Rewards says "coming soon"). |
| 25 | **Coupon rules.** Category coupons do not include sub-categories, and the minimum-order check uses the full cart subtotal. | Change if the business needs it. |

### Performance and scale

| # | Item | Note |
|---|---|---|
| 26 | **Several requests per admin screen.** Orders sends 7 count requests per filter change; Products sends about 11 on load. | Add one counts endpoint per page. |
| 27 | **Fixed caps.** Inventory report lists show at most 100 rows each; the admin product lookup holds at most 1,000 products; profit-per-product is sorted in memory. | Add paging when the catalog grows. |
| 28 | **Courier dispatch keeps a database transaction open** during the courier call (up to 8 s). | This prevents double booking. Revisit under heavy dispatch load. |
| 29 | **Some things live in each server's memory:** the response cache, the rate limiter and the cron scheduler. | Run one backend instance, or move them to Redis before running several. |

### Design and accessibility

| # | Item | Note |
|---|---|---|
| 30 | **White text on the brand pink (#FF6B8B) is below WCAG AA contrast** (2.72:1). | Kept as a brand exception on main buttons. Text-coloured pink already uses the darker #C9325C. |
| 31 | **Small design differences from the mockups.** Selected calendar days are pink (the mockups use green). The tagline stays "Healthy Life • Happy You". | Change if the client asks. |

### Development environment

| # | Item | Note |
|---|---|---|
| 32 | **`next build` can fail** with a Turbopack Google-font cache error. | Delete `frontend/.next` and build again (also in the README). CI and Docker always start clean. |
| 33 | **AVIF/WebP images are not produced on Windows development.** The image library (`sharp`) does not load there. | Verify in the Linux Docker image. |
| 34 | **Passwords with Bangla or other multi-byte characters can be cut short.** Registration limits passwords to 72 *characters*, but bcrypt only reads the first 72 *bytes*. Staff passwords already check bytes. | Validate the byte length at registration too. |
| 35 | **Backend test suites share one local database,** and a few leave rows behind. | Run `bun run test:db:reset` when local data looks cluttered. |
| 36 | **KPI trend percentages can look very large** on sparse demo data (for example +988 %). | These are the real numbers; they settle down with real traffic. |
