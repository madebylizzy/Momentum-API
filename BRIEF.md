# Momentum Properties API — Project Brief

## 1. Project Overview
This is Task 1 of the Five Engineering Tasks: a REST API serving realistic property listings data, deployed to a public URL, plus a minimal consumer application that calls the live API and displays the result.

This is a standalone project in its own repository — not a Momentum platform slice, and not connected to the four earlier assessments. No authentication is required for reading; the API itself is the product.

## 2. Domain: Property Listings
Three related resource types:
- **Agents** — real estate agents who list properties
- **Listings** — properties for sale or rent, each belonging to one agent
- **Viewings** — scheduled viewing appointments for a listing

Relationships: an agent has many listings; a listing has many viewings; a viewing belongs to one listing.

## 3. What I Am Building
- A versioned REST API (`/api/v1/...`) with full CRUD-appropriate endpoints for all three resources
- Pagination, filtering, and sorting on every list endpoint
- A consistent response envelope and a consistent error envelope, used everywhere
- Honest HTTP status codes: 200, 201, 400, 404, 422, 429 — no 200 with an error in the body, no 500 for a malformed identifier
- Rate limiting backed by a persistent store (not in-memory — see §6), keyed on IP
- A repeatable seed script using Faker, loading several hundred records per resource, safe to run twice without duplicating data
- A minimal consumer page: a list, a filter control, a "next page" button, calling the live deployed URL — never localhost
- Full README documentation: every endpoint, every query parameter with type and default, a curl example and example response for each, plus a "Design decisions" section

## 4. What I Am NOT Building
- Authentication for reading (the API is public)
- Any interface beyond the minimal consumer
- A landing page
- An admin panel
- Write authentication beyond what's needed to demonstrate the mutation endpoints work (state this choice plainly if write endpoints are left open for demo purposes, or gate them simply — decide and document, don't leave it ambiguous)

## 5. Identifiers
Every resource uses a generated, non-sequential identifier (cuid or UUID) — never an auto-incrementing integer. State this explicitly in the README's Design Decisions section, with the actual reason: sequential integers let anyone enumerate the entire dataset by counting.

## 6. Deployment
- **Platform:** Vercel
- **Database:** Postgres via Neon, provisioned through the Vercel Marketplace integration — not "Vercel Postgres" directly, since that product was discontinued in 2025. This is the current standard path and still satisfies "use a managed Postgres."
- **Connection pooling:** Use Neon's pooled connection string (not the direct/unpooled one) for all serverless function database access, since Vercel's stateless function execution can exhaust unpooled connections quickly under load.
- **Rate limiting storage:** Must NOT be a plain in-memory store. Vercel functions are stateless and may run on different instances per request, so an in-memory counter will not actually limit anything in production even though it appears to work in local testing. Use a persistent, shared store (e.g. a dedicated rate-limit table in the same Postgres database, or a lightweight external store like Upstash Redis if one is set up) — decide and document which, with the reason.

## 7. Success Criteria
- [ ] Three or more related resources, with real foreign-key relationships
- [ ] A repeatable seed script, several hundred records per resource, no duplicates on re-run
- [ ] Every path versioned under `/api/v1/`
- [ ] Pagination (limit/offset, default 20, max 100, clamped not honoured beyond max), filtering on at least two fields, sorting, on every list endpoint
- [ ] One consistent success envelope and one consistent error envelope, used on every endpoint
- [ ] Correct status codes: 400 for bad input (e.g. negative offset, unknown sort field), 404 for not found, 422 for missing required fields (with the field named), 429 for rate limit exceeded with `Retry-After`
- [ ] Rate limiting backed by a persistent store, numbers in configuration, not hardcoded in a handler
- [ ] Full README documentation sufficient to use the API without ever speaking to the author
- [ ] Deployed to a live public URL, seeded, reachable from outside my own machine
- [ ] A consumer app calling the live URL, demonstrating pagination and filtering together
