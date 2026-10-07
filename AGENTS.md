# AGENTS.md

## Project Name
Momentum Properties API (Task 1 — Build and Serve a Consumable API)

## 1. Project Context
This is a standalone project, not part of the Momentum platform slices (Assessments 1–4). It is Task 1 of the Five Engineering Tasks. The deliverable is a live, public, documented REST API plus a minimal consumer app proving it works from outside its own codebase.

## 1a. Tech Stack
- **Framework:** Next.js (API routes) — consistent with the rest of this body of work, and Vercel's native framework
- **Database:** PostgreSQL via Neon (Vercel Marketplace integration) — confirm at setup time this is the current provisioning path, since Vercel's own database offerings have changed before and may change again
- **ORM:** Prisma
- **Seed data:** `@faker-js/faker`
- **Deployment:** Vercel

Do not introduce a different framework, database, or ORM without explicit confirmation.

## 1b. Rate Limiting — Must Be Persistent, Not In-Memory
Every prior project in this body of work used an in-memory rate limiter. That pattern does not work on Vercel's serverless functions, which are stateless and may execute on different instances per request. Build rate limiting against a persistent store from the start:
- Preferred: a dedicated `RateLimitBucket` table in the same Postgres database, keyed on IP + endpoint, with a window start timestamp and a count, read/incremented atomically.
- Acceptable alternative: an external store (e.g. Upstash Redis) if set up — state why if chosen over the database option.
Do not build this as an in-memory object "to get started" and plan to fix it later — it must be correct from first implementation, since the evidence requirement (a real 429 screenshot from the live deployed URL) will not be achievable otherwise.

## 2. Your Role
Same discipline as the Momentum assessments: follow requirements carefully, build only what's in scope, ask before unstated product decisions, work in small reviewable checkpoints with real evidence at each stop — not descriptions of intended behavior.

## 3. Scope

### Resource Design (must happen before any code)
Write the resource table (fields, types, required/optional, identifier type) and relationship diagram into the README first. Do not write schema or route code until this exists and has been reviewed.

### Identifiers
All public-facing identifiers are generated (cuid or UUID v4), never sequential integers. State explicitly in the README why.

### Seed Script
- Uses `@faker-js/faker` to generate several hundred records per resource with realistic relationships (listings genuinely belonging to real agent IDs, viewings genuinely belonging to real listing IDs).
- Must be idempotent: running it twice must not create duplicate data. Use an upsert pattern or a check-before-insert, and test this explicitly — run it twice, confirm record counts don't double.
- Commit the script itself. Never commit a database dump or a `.sql` data file.

### Endpoints
Follow REST conventions exactly: plural nouns, HTTP method carries the verb, every resource gets a collection and an item endpoint, every path under `/api/v1/`.

### List Endpoint Contract (every single list endpoint, no exceptions)
- Pagination: `limit` (default 20, max 100 — clamp, don't reject, a request for more than 100) and `offset`. Response includes `meta.total`, `meta.limit`, `meta.offset`, `meta.hasMore`.
- Filtering: at least two fields per resource (e.g. listings filterable by `city` and `minPrice`).
- Sorting: `?sort=field&order=asc|desc`. An unknown sort field returns 400, never silently ignored.

### Envelope Shape (locked, use everywhere)
Success:
```json
{ "data": [...], "meta": { "total": 340, "limit": 20, "offset": 0, "hasMore": true } }
```
(For a single-item response, `data` is the object directly, `meta` omitted or minimal.)

Error:
```json
{ "error": { "code": "NOT_FOUND", "message": "Listing not found" } }
```
Every error response uses this shape and an honest status code. Never 200 with an error message in the body.

### Input Validation (a schema validator — e.g. Zod — used consistently, not scattered ad hoc checks)
- `limit` above 100: clamp to 100, do not reject
- Negative `offset`: 400 with a clear message
- Unknown `sort` field: 400, never silently sorted by nothing
- Malformed identifier: 404 or 400, never 500
- POST with a missing required field: 422, with the specific field named in the error

### Rate Limiting
Per §1b — persistent store, numbers (requests per window, window length) in a config file, not inline in a handler. Returns 429 with `Retry-After` header on breach.

## 4. Out of Scope
Do NOT build:
- Authentication for reading
- A landing page or marketing page
- An admin panel
- Anything beyond the minimal consumer (list, filter, next-page button)

## 5. Decision Log (mandatory, every checkpoint)
Same rule as every prior project: anything built beyond what's explicitly asked for gets named, with reasoning, in the same message it's built — including a "Beyond the brief" section in every checkpoint report, even when empty.

## 6. Known Traps (from the task — check against these explicitly)
- Sequential integer identifiers
- Returning the whole collection when no limit is supplied
- Different response envelope shapes on different endpoints
- Returning 200 with an error message in the body
- Deploying without running the seed script, so the live API is empty
- Building and testing the consumer against localhost, never actually testing the deployed public URL
- (Added for this stack specifically) An in-memory rate limiter that silently does nothing on Vercel's serverless functions

## 7. Defence Questions (prepare to answer these exactly as asked)
- Why did you choose offset pagination (or cursor), and when would the other be better?
- What happens if I request page 50 of a resource that has 30 pages?
- Show me where your rate limit number lives and tell me why it lives there.
- I want to add a field to the listing resource without breaking existing clients. Walk me through it.

## 8. Required Evidence
- The live API URL
- A screenshot of `curl` hitting the live URL from a real terminal, showing a real paginated response
- A screenshot of the 429 response after genuinely exceeding the rate limit against the live deployed URL (not localhost — this is the test that actually proves the persistent rate limiter works under real serverless conditions)
- A screenshot of the consumer app displaying real data fetched from the live API
- The seed script itself, committed

## 9. README Structure
The README is the API's documentation. It must include, for every endpoint: method, path, query parameters with types and defaults, a curl example, and an example response — sufficient that a developer who has never spoken to the author can use the API. Add a "Design decisions" section covering: why these three resources, why generated identifiers, why offset pagination (or cursor, if chosen) and the tradeoff against the other, what the envelope shape is and why, and why the rate-limit store had to be persistent rather than in-memory on this deployment target.
