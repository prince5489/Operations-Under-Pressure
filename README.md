# Operations Under Pressure (Newtonite Ops)

An operational management platform for creating, assigning, resolving, and auditing high-priority work items across specialized teams (Payments, Support, Compliance). Built for the Newtonite Software Engineering Challenge.

---

## Tech Stack
- **Frontend**: React 18 + Vite (Clean, responsive operational dashboard, status pipelines, and audit timelines)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **ORM**: Prisma Client & Migrations
- **Testing**: Jest + Supertest

---

## Key Features

1. **Authentication & Role-Based Access Control**:
   - Seeded demo users with tiered roles: `Viewer`, `Member`, `Lead`, `Admin`.
   - Permissions are enforced strictly on the backend across all API routes.
2. **Work Items Management**:
   - Full lifecycle management across 5 types (`Incident`, `Customer Issue`, `Payment`, `Compliance`, `Task`) and 4 priority levels (`Low`, `Normal`, `High`, `Urgent`).
   - Creation, inspection, assignment, and updates with optimistic concurrency control (`version` counter).
3. **Strict Workflow State Machine**:
   - Status pipeline: `Open` &rarr; `In Progress` &rarr; `Awaiting Approval` &rarr; `Resolved` &rarr; `Closed`.
   - State transition validation on the server.
   - Lead/Admin sign-off required for resolving items from `Awaiting Approval`.
4. **Operations Dashboard**:
   - Three preset workflow views:
     - **Assigned to Me**: Items assigned to the current user.
     - **Unassigned Urgent**: Unassigned high-priority tickets requiring immediate attention.
     - **Awaiting My Approval**: Pending approval items within teams where the user is a Lead or Admin.
   - Live search (title and description), status and priority filters, and server-side pagination.
5. **Activity Audit History**:
   - Status transitions, reassignments, priority changes, and comments are persisted in the **same database transaction** as the item mutation.
6. **Critical Engineering Behaviours**:
   - **Concurrent Claim**: Atomic conditional update ensures exactly one winner under simultaneous race conditions.
   - **Stale Update Protection**: Optimistic locking rejects stale writes with HTTP 409 and returns the current version.
   - **Idempotency**: Requests with matching `Idempotency-Key` headers return the cached response without creating duplicates.
   - **Workflow Validation**: Server rejects illegal transitions (HTTP 422) and unauthorized approvals (HTTP 403).
   - **Multi-Tenant Team Isolation**: Users outside a team receive HTTP 404 to prevent ID enumeration.

---

## Demo Accounts

All demo accounts share the password **`password123`**:

| User | Email | Role(s) | Description |
| :--- | :--- | :--- | :--- |
| **Alice** | `alice@demo.test` | Lead (Payments), Member (Support) | Can approve Payments items; can work Support items |
| **Bob** | `bob@demo.test` | Member (Payments) | Can create, edit, claim Payments items |
| **Carol** | `carol@demo.test` | Lead (Support) | Can approve Support items |
| **Dave** | `dave@demo.test` | Viewer (Payments) | Read-only access to Payments |
| **Erin** | `erin@demo.test` | Admin (All Teams) | Global admin access across Payments, Support, and Compliance |

> **Tip**: The UI includes a convenient quick-switcher in the sidebar to toggle between users in 1 click and verify role enforcement live.

---

## Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- Docker & Docker Compose (optional; embedded local PostgreSQL is also provided)

### Local Setup (Without Docker)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   *Note: If PostgreSQL is not already running on port 5432, `npm run dev` will automatically initialize and start the local embedded PostgreSQL database cluster.*

4. **Build the production bundle**:
   ```bash
   npm run build
   ```

5. **Start the production server**:
   ```bash
   npm start
   ```

6. Open **http://localhost:3000** in your web browser.

---

### Running with Docker

```bash
docker compose up --build
```
Open **http://localhost:3000** once the container health checks pass.

---

## Running the Automated Tests

The test suite validates all six critical engineering behaviours specified in the challenge requirements:

```bash
npm test
```

### Test Suite Coverage
- `two people claiming at once: exactly one wins` (Race condition & concurrency check)
- `stale version is rejected and data stays unchanged` (Optimistic locking conflict check)
- `same idempotency key creates one item` (Deduplication check)
- `invalid jump is rejected, and only a lead can approve` (Workflow validation & RBAC check)
- `a user from another team cannot read or write` (Team boundary isolation & 404 check)
- `history is written with the change` (Transactional activity log check)

---

## Useful Database Commands

```bash
npm run db:status   # Check status of local PostgreSQL cluster
npm run db:start    # Start local PostgreSQL cluster
npm run db:stop     # Stop local PostgreSQL cluster
npm run migrate     # Synchronize schema using Prisma
npm run seed        # Re-seed database with clean demo data
```

---

## Known Limitations & Future Roadmap
See [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md) for detailed architectural analysis and design trade-offs.
# Operations-Under-Pressure
