# Engineering Decisions & Trade-Offs

This document details five key architectural and engineering decisions implemented in **Operations Under Pressure (Newtonite Ops)**, explaining the technical rationale, mechanics, and trade-offs of each.

---

## 1. Optimistic Concurrency Control with Version Column

### Mechanics
Every work item carries an integer `version` initialized to `1`. When clients submit updates (`PATCH /items/:id`) or workflow transitions (`POST /items/:id/transition`), they must provide the `version` they observed. The database update atomically evaluates:
```sql
UPDATE work_items 
SET ..., version = version + 1, updated_at = now()
WHERE id = $1 AND version = $2;
```
If the row was modified by another user concurrently, zero rows are affected. The backend immediately detects this, reloads the current state, and aborts with HTTP `409 Conflict`, returning the latest work item so the client can resolve the divergence.

### Trade-offs
- **Pros**: Completely avoids distributed locking or pessimistic database row locks (`SELECT FOR UPDATE`), which would cause lock contention, connection starvation, and latency spikes under heavy read loads.
- **Cons**: Write conflicts must be handled by the client (by reloading state or prompting the user to re-apply changes) rather than automatically queueing the conflicting requests.

---

## 2. Atomic Row-Level Claiming with Conditional UPDATE

### Mechanics
To ensure that only one user can claim an unassigned work item under concurrent race conditions, claiming does not rely on application-level locks or pre-flight checks:
```sql
UPDATE work_items
SET assignee_id = $2, version = version + 1, updated_at = now()
WHERE id = $1 AND assignee_id IS NULL AND status <> 'closed';
```
PostgreSQL's row-level lock ensures that when multiple workers simultaneously attempt to claim the same item, the first transaction updates the row and sets `assignee_id`. The second transaction waits for row lock release, inspects the row, finds `assignee_id IS NOT NULL`, updates zero rows, and is rejected with HTTP `409 Conflict`.

### Trade-offs
- **Pros**: Completely race-condition free without external dependencies like Redis Redlock or distributed mutexes. High performance and simplicity.
- **Cons**: Claiming is strictly first-come, first-served at the database tier; cannot implement priority-based pre-emption without additional queuing logic.

---

## 3. Transaction-Bound Idempotency Keys

### Mechanics
Network drops, client retries, and double clicks can easily result in duplicate financial payments or incident tickets. Clients submit an `Idempotency-Key` header with creation requests. The backend executes an atomic reservation within the exact same database transaction as the item creation:
```sql
INSERT INTO idempotency_keys (key, user_id)
VALUES ($1, $2)
ON CONFLICT (key, user_id) DO NOTHING;
```
If a duplicate request is received, it retrieves the previously committed response from `idempotency_keys` and returns it with HTTP `201 Created` without duplicate side-effects.

### Trade-offs
- **Pros**: Guarantees exactly-once processing semantics for item creations across network drops and automated client retries.
- **Cons**: Idempotency records consume database storage and require an eventual retention cleanup strategy (e.g. TTL index or 24-hour expiration worker).

---

## 4. Strict Server-Side Workflow Validation & Role-Gated Approvals

### Mechanics
Work items transition strictly through:
```
Open → In Progress → Awaiting Approval → Resolved → Closed
```
All state transitions are validated on the server via a deterministic state machine map (`FLOW`). Moving from `awaiting_approval` to `resolved` represents a formal sign-off step and strictly requires the `lead` or `admin` role in the item's team. Requests from members receive HTTP `403 Forbidden`. Invalid state jumps (e.g., Open → Closed or Open → Resolved) receive HTTP `422 Unprocessable Entity`.

### Trade-offs
- **Pros**: Enforces strict audit compliance and organizational separation of duties. Prevents rogue or buggy clients from skipping required verification gates.
- **Cons**: Hardcoding workflow transitions requires database migration or backend redeployment to alter the lifecycle stages of work items.

---

## 5. Team-Scoped Authorization with 404 for Outsiders

### Mechanics
Every team-related operation verifies user role rank (`viewer: 1, member: 2, lead: 3, admin: 4`). Crucially, if a user attempts to access or modify an item belonging to a team they do not belong to, the server responds with **HTTP 404 Not Found** instead of HTTP 403 Forbidden:
```javascript
const item = await db.workItem.findUnique({ where: { id } });
if (!item || !user.teams[item.teamId]) {
  throw new HttpError(404, 'item not found');
}
```

### Trade-offs
- **Pros**: Mitigates ID enumeration and information leakage attacks. Unauthorized actors cannot even infer whether a sensitive incident, payment dispute, or compliance ticket ID exists in the system.
- **Cons**: Slightly obscures debugging during development if a legitimate user forgot they had not been granted team access.

---

## Known Limitations
1. **Notification Outbox**: Background email/webhook notifications are intentionally omitted to avoid distributed transaction overhead without a dedicated transactional outbox.
2. **Text Search Scalability**: Search utilizes case-insensitive pattern matching (`mode: 'insensitive'`), which suffices for operational workloads up to 100,000 rows. For multi-million row scale, a dedicated PostgreSQL `tsvector` GIN index or trigram index would be added.
3. **Idempotency Expiry**: Idempotency keys are persisted indefinitely and would benefit from a scheduled cron retention prune in high-volume production deployments.
