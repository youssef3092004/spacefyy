# Spacefy — Capacity & Traffic Statistics

**Generated:** 2026-07-05 · Scenario basis: **1 branch with 10 bookable resources** (workspaces / PlayStations) serving **~10 concurrent clients**.

> This is a **model**, not a measurement. The "Facts" section is read from your code and is reliable. The "Assumptions" section is editable — change the numbers there and the totals scale linearly. Pricing tiers reflect the well-known Vercel/Supabase plan structure as of early 2026; **verify current limits on their pricing pages before you commit**, since cloud pricing changes often.

---

## 1. TL;DR

| Question | Normal usage | Very high usage |
|---|---|---|
| HTTP requests / month (Vercel invocations) | **~90,000** | **~380,000** |
| Postgres queries / month (Supabase) | **~120,000** | **~325,000** |
| Requests per client **per visit** | **~75** | **~140** |
| Requests per resource **per day** | **~300** | **~1,260** |
| DB growth / year (excl. images) | **~150 MB** | **~350 MB** |

**Recommended production stack for a real (commercial) business:**

- **Vercel Pro — $20/mo** *(required: the Free "Hobby" plan is non-commercial per Vercel's ToS — volume is not the issue, the license is).* **See the ⚠️ caveat in §7 first — your current server + WebSocket + cron design does not run on Vercel serverless.**
- **Supabase Pro — $25/mo** *(needed for no auto-pause + daily backups; Free pauses after 7 days idle and caps at 500 MB).*
- **Redis Cloud — Free (30 MB)** is enough to start.
- **Total ≈ $45–50/month** for one professional branch. Volume alone would fit the free tiers; you pay for **commercial licensing, uptime, and backups**, not for the traffic.

---

## 2. Facts (read from your codebase)

| Fact | Value | Source |
|---|---|---|
| REST endpoints | **228** across 32 routers | `routes/*.js` |
| Live space-overview | **WebSocket push**, not polling | `emitSpaceOverviewUpdate` called from `session.js`, `sessionComponent.js` |
| Cron: visit auto-cancel | every **5 min** (288×/day) | `utils/visitAutoCancelCron.js` (`*/5 * * * *`) |
| Cron: branch stats | **monthly** | `utils/branchStatsCron.js` (`5 0 1 * *`) |
| Cron: storage usage | **weekly** | `utils/storageUsageCron.js` (`0 0 * * 0`) |
| Cache: lists | 300 s (5 min) | `TTL_LIST` in `.env` |
| Cache: by-id | 480 s (8 min) | `TTL_BY_ID` |
| Cache: analytics | 900 s (15 min) | `TTL_ANALYTICS` |
| Stack | Vercel + Supabase Postgres (pooler) + Redis Cloud | `.vercel/`, `.env` |

**Why the WebSocket fact matters:** because the live dashboard is push-based, watching a branch in real time costs **~0 HTTP requests**. Updates are only emitted when a session/component actually changes. This is the single biggest reason your request volume stays modest — a polling design would multiply the numbers below by 5–10×.

**Why caching matters:** repeated `GET` list/detail calls within the TTL window are served from **Redis, not Postgres**. So Vercel invocations (billed per HTTP request, cache hit or miss) are **higher** than Supabase queries (only cache-misses + writes reach Postgres). The two are modeled separately below.

---

## 3. Assumptions (editable — this is where you tune the model)

| Assumption | Normal | High | Notes |
|---|---|---|---|
| Bookable resources (workspaces/PS) | 10 | 10 | Your stated scenario |
| Operating hours / day | 12 | 14 | |
| Visits per resource / day | 4 | 9 | Turnover / churn |
| **Visits per day (branch)** | **40** | **~90** | resources × visits |
| HTTP requests per full visit lifecycle | 25 | 40 | see §4 breakdown |
| Staff dashboard HTTP GETs / day | ~2,000 | ~9,000 | list refreshes not covered by WS |
| Postgres queries per write action | ~5 | ~7 | transactions run several queries |

---

## 4. What one client's visit actually costs (request breakdown)

A single customer visit, staff-driven, from arrival to paid:

| Step | Endpoint(s) | Requests (normal) |
|---|---|---|
| Find / create customer | `customers` | 2 |
| Start visit + read it back | `visits` | 2 |
| Start session + component (assign resource) | `sessions`, `session-components` | 2 |
| Order food/drinks (3 rounds) | `orders/create` | 3 |
| Adjust quantities / add items | `orders/item/:id` | 2 |
| Staff status refreshes during visit | `orders`, `visits` (GET) | ~6 |
| Close visit | `visits/close` | 1 |
| Create invoice | `invoices/create` | 1 |
| Pay invoice | `invoices/pay` | 1 |
| Misc reads (receipt, order detail) | GET | ~5 |
| **Subtotal (lifecycle)** | | **~25** |
| + share of shared dashboard traffic | | ~50 |
| **Total per visit (normal)** | | **~75** |
| **Total per visit (high)** | | **~140** |

**"Average request for every client of 10":**

- **Per client, per visit:** ~75 (normal) → ~140 (high)
- **Per resource/seat, per day** (4–9 visits): ~300 (normal) → ~1,260 (high)
- **Across all 10 clients, per day:** ~3,000 (normal) → ~12,600 (high)

---

## 5. Total volume

### HTTP requests (Vercel invocations — every request, cache hit or miss)

| | Normal | High |
|---|---|---|
| Lifecycle (visits × req/visit) | 40 × 25 = 1,000/day | 90 × 40 = 3,600/day |
| Dashboard GETs | ~2,000/day | ~9,000/day |
| Cron (auto-cancel, internal) | 288/day | 288/day |
| **Per day** | **~3,300** | **~12,900** |
| **Per month (×30)** | **~90,000** | **~380,000** |

### Postgres queries (Supabase — only writes + cache-misses reach the DB)

| | Normal | High |
|---|---|---|
| Writes (visits × ~12 writes × ~5 q) | ~2,400/day | ~7,600/day |
| Cache-miss reads (post-invalidation) | ~1,300/day | ~3,000/day |
| Cron queries | ~300/day | ~300/day |
| **Per day** | **~4,000** | **~10,900** |
| **Per month** | **~120,000** | **~325,000** |

---

## 6. Supabase (database) sizing

| Metric | Your load | Free (500 MB, shared) | Pro ($25/mo) |
|---|---|---|---|
| Queries/month | 120K–325K | OK on volume, but **shared compute throttles under bursts** | Comfortable |
| DB size growth | ~150–350 MB/year (images live in Cloudinary, so rows stay small) | Will exhaust 500 MB in ~1.5–3 yrs; `BlacklistedToken` grows unbounded (see `task.js` #21) | 8 GB included |
| Auto-pause | — | **Pauses after 7 days idle** → cold starts / downtime | No pause |
| Backups | — | **None** | Daily backups |
| Connections | serverless opens many | Must use **transaction pooler (port 6543)**, not session pooler (5432), or you exhaust connections | Same, but more headroom |

**Verdict:** volume fits Free, but **Pro is the right call for a real business** — for no-pause uptime and daily backups, not for raw throughput. **Action item:** your `.env` connects on port `5432` (session pooler). On serverless you should use the **transaction pooler on `6543`** to avoid connection exhaustion.

---

## 7. Vercel (hosting) sizing

| Metric | Your load | Hobby (Free) | Pro ($20/mo) |
|---|---|---|---|
| Invocations/month | 90K–380K | Within technical limits | Within limits |
| Bandwidth | small JSON payloads, well under 100 GB | 100 GB | 1 TB |
| Function timeout | order/visit transactions are short | 10 s | up to 60–300 s |
| Commercial use | a paid business | **Not allowed (personal only)** | **Allowed** |

**Verdict on volume:** even Hobby could carry the traffic. **But Hobby forbids commercial use**, so a revenue business must be on **Pro ($20/mo)**.

### ⚠️ Critical architecture caveat — read this before choosing Vercel

Your `server.js` uses **`httpServer.listen()` + Socket.IO + `node-cron`** — a **long-running, stateful server**. **Vercel serverless functions cannot do this:**

- **`node-cron` will not fire** — there is no always-on process, so auto-cancel/stats/storage crons silently never run.
- **Socket.IO cannot hold connections** — serverless functions are short-lived, so the live space-overview WebSocket won't stay connected.

So on Vercel serverless, two of your headline features are effectively broken. You have three options:

1. **Deploy the whole app to a persistent host** — Railway / Render / Fly.io / a small VPS (~$5–20/mo). This is the **best fit for your current design**; keep Vercel only for a frontend if you have one. *(Recommended.)*
2. **Split:** REST API stays on Vercel; move WebSocket + crons to a persistent worker. More moving parts.
3. **Re-architect for Vercel:** use Vercel Cron Jobs for the schedules and a managed realtime service (e.g. Supabase Realtime / Pusher) instead of Socket.IO.

**If you go with option 1**, your Vercel line item disappears and you'd pay the persistent host instead (~$5–20/mo), which changes the cost table below.

---

## 8. Redis (cache)

- Payloads are small TTL'd JSON. At this scale you stay **well under the Redis Cloud Free 30 MB tier**.
- Note (from `task.js` #16): the `TTL_BY_VISIT` env var used by `/invoices/getByVisit` isn't defined, so those keys currently cache **forever** — a memory leak over time. Fix that and Free is comfortable indefinitely.

---

## 9. Scaling to 10 branches

Everything above is **per branch**. Multiply by branch count (traffic scales roughly linearly, WebSocket rooms are per-branch):

| Metric | 1 branch (high) | 10 branches (high) |
|---|---|---|
| HTTP requests/month | ~380K | **~3.8M** |
| Postgres queries/month | ~325K | **~3.3M** |
| DB growth/year | ~350 MB | **~3.5 GB** |

At 10 branches you're still within **Vercel Pro / Supabase Pro**, but:
- Supabase Pro's included compute may need a **compute add-on** for 3M+ queries with bursty load.
- Watch the **connection pool** hard — 10 branches of serverless traffic makes the pooler-port issue (§6) mandatory, not optional.
- DB size crosses multiple GB → Pro's 8 GB is fine, but plan an archival/cleanup strategy (old visits, blacklisted tokens).

---

## 10. Recommended plans & cost summary

| Component | Plan | Cost/mo | Why |
|---|---|---|---|
| Hosting (persistent — **recommended**) | Railway / Render / Fly | ~$5–20 | Runs your Socket.IO + node-cron design as-is |
| — *or* Hosting (Vercel) | Vercel Pro | $20 | Only if you re-architect WS + crons (§7) |
| Database | Supabase Pro | $25 | No auto-pause, daily backups, 8 GB |
| Cache | Redis Cloud Free | $0 | 30 MB covers this scale |
| **Total** | | **~$30–50/mo** | For one professional branch |

**Bottom line:** your traffic (even "very high" = ~380K requests/month for one branch) is **modest** and fits the entry paid tiers with lots of headroom. The real decisions are **licensing** (commercial → paid plans) and **architecture** (your stateful server needs a persistent host, not Vercel serverless), **not** whether you'll hit a request ceiling.

---

*Model inputs live in §3. To reproject for your real numbers, change resources / visits-per-day / requests-per-visit there and re-multiply through §4–§5.*
