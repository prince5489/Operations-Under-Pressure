const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { prisma, formatItem } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const RANK = { viewer: 1, member: 2, lead: 3, admin: 4 };

// Allowed status workflow transitions
const FLOW = {
  open: ['in_progress'],
  in_progress: ['open', 'awaiting_approval'],
  awaiting_approval: ['in_progress', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const TYPES = ['incident', 'customer_issue', 'payment', 'compliance', 'task'];

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const app = express();
app.use(express.json());

// Serve static React build files
app.use(express.static(path.join(__dirname, '../public')));

async function auth(req, res, next) {
  let user;
  try {
    const authHeader = req.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { id } = jwt.verify(token, SECRET);
    const memberships = await prisma.membership.findMany({
      where: { userId: id },
      include: { team: true },
    });
    user = {
      id,
      teams: Object.fromEntries(memberships.map(m => [m.teamId, m.role.toLowerCase()])),
      memberships: memberships.map(m => ({ id: m.teamId, name: m.team.name, role: m.role.toLowerCase() })),
    };
  } catch (e) {
    return res.status(401).json({ error: 'please log in' });
  }
  req.user = user;
  next();
}

function need(user, teamId, minRole) {
  const role = user.teams[teamId];
  if (!role || RANK[role] < RANK[minRole]) {
    throw new HttpError(403, `you need the ${minRole} role in this team`);
  }
}

async function loadItem(db, user, id, minRole) {
  const item = await db.workItem.findUnique({
    where: { id: Number(id) },
    include: {
      team: true,
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  });
  if (!item || !user.teams[item.teamId]) {
    throw new HttpError(404, 'item not found');
  }
  if (minRole) {
    need(user, item.teamId, minRole);
  }
  return item;
}

// Authentication
app.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email: String(email || '').trim() },
    include: {
      memberships: {
        include: { team: true },
      },
    },
  });

  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    throw new HttpError(401, 'wrong email or password');
  }

  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '8h' });
  res.json({
    token,
    name: user.name,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      teams: user.memberships.map(m => ({ id: m.teamId, name: m.team.name, role: m.role })),
    },
  });
}));

app.get('/me', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: {
        include: { team: true },
      },
    },
  });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    teams: user.memberships.map(m => ({ id: m.teamId, name: m.team.name, role: m.role })),
  });
}));

app.get('/teams', auth, wrap(async (req, res) => {
  const userTeamIds = Object.keys(req.user.teams).map(Number);
  const teams = await prisma.team.findMany({
    where: { id: { in: userTeamIds } },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  res.json(teams);
}));

app.get('/users', auth, wrap(async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });
  res.json(users);
}));

// Dashboard & Work Items Listing
app.get('/items', auth, wrap(async (req, res) => {
  const q = req.query;
  const userTeamIds = Object.keys(req.user.teams).map(Number);
  if (!userTeamIds.length) {
    return res.json({ items: [], nextCursor: null, total: 0, page: 1, totalPages: 0 });
  }

  const where = {
    teamId: { in: userTeamIds },
  };

  if (q.team_id && userTeamIds.includes(Number(q.team_id))) {
    where.teamId = Number(q.team_id);
  }
  if (q.status) {
    where.status = q.status;
  }
  if (q.priority) {
    where.priority = q.priority;
  }
  if (q.type) {
    where.type = q.type;
  }
  if (q.assignee) {
    if (q.assignee === 'me') {
      where.assigneeId = req.user.id;
    } else if (q.assignee === 'unassigned') {
      where.assigneeId = null;
    } else {
      where.assigneeId = Number(q.assignee);
    }
  }

  if (q.q && q.q.trim()) {
    const term = q.q.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  // Dashboard preset views:
  // 1. assigned_to_me
  // 2. unassigned_urgent
  // 3. awaiting_my_approval
  if (q.view === 'assigned_to_me') {
    where.assigneeId = req.user.id;
  } else if (q.view === 'unassigned_urgent') {
    where.assigneeId = null;
    where.priority = 'urgent';
    where.status = { not: 'closed' };
  } else if (q.view === 'awaiting_my_approval') {
    const leadTeams = Object.keys(req.user.teams)
      .filter(t => RANK[req.user.teams[t]] >= RANK.lead)
      .map(Number);
    where.teamId = { in: leadTeams };
    where.status = 'awaiting_approval';
  }

  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);

  if (q.cursor) {
    where.id = { lt: Number(q.cursor) };
  }

  const countWhere = { ...where };
  delete countWhere.id;
  const total = await prisma.workItem.count({ where: countWhere });

  let skip = 0;
  if (!q.cursor && q.page && Number(q.page) > 1) {
    skip = (Number(q.page) - 1) * limit;
  }

  const rows = await prisma.workItem.findMany({
    where,
    orderBy: { id: 'desc' },
    take: limit + 1,
    skip: q.cursor ? 0 : skip,
    include: {
      team: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = rows.length > limit;
  const rawItems = hasMore ? rows.slice(0, limit) : rows;
  const items = rawItems.map(formatItem);
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  const currentPage = q.page ? Number(q.page) : 1;
  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    items,
    nextCursor,
    total,
    page: currentPage,
    limit,
    totalPages,
  });
}));

// Create Work Item
app.post('/items', auth, wrap(async (req, res) => {
  const b = req.body;
  const teamId = Number(b.team_id || b.teamId);
  const title = (b.title || '').trim();
  const type = (b.type || '').toLowerCase();
  const priority = (b.priority || 'normal').toLowerCase();

  if (!title || !TYPES.includes(type) || !teamId) {
    throw new HttpError(400, 'title, type and team_id are required');
  }
  if (!PRIORITIES.includes(priority)) {
    throw new HttpError(400, 'bad priority');
  }
  need(req.user, teamId, 'member');

  const key = req.get('Idempotency-Key');

  const item = await prisma.$transaction(async (tx) => {
    if (key) {
      const inserted = await tx.$executeRaw`
        INSERT INTO idempotency_keys (key, user_id)
        VALUES (${key}, ${req.user.id})
        ON CONFLICT (key, user_id) DO NOTHING
      `;
      if (inserted === 0) {
        const stored = await tx.idempotencyKey.findUnique({
          where: { key_userId: { key, userId: req.user.id } },
        });
        if (stored && stored.response) {
          return stored.response;
        }
      }
    }

    const created = await tx.workItem.create({
      data: {
        title,
        description: b.description || '',
        type,
        priority,
        teamId,
        createdById: req.user.id,
        assigneeId: b.assignee_id ? Number(b.assignee_id) : (b.assigneeId ? Number(b.assigneeId) : null),
        dueDate: b.due_date ? new Date(b.due_date) : (b.dueDate ? new Date(b.dueDate) : null),
      },
    });

    await tx.activityEvent.create({
      data: {
        itemId: created.id,
        userId: req.user.id,
        kind: 'created',
        detail: { priority: created.priority, type: created.type },
      },
    });

    const formatted = formatItem(created);

    if (key) {
      await tx.idempotencyKey.update({
        where: { key_userId: { key, userId: req.user.id } },
        data: { response: formatted },
      });
    }

    return formatted;
  });

  res.status(201).json(item);
}));

// Work Item Details
app.get('/items/:id', auth, wrap(async (req, res) => {
  const item = await loadItem(prisma, req.user, req.params.id, 'viewer');
  res.json(formatItem(item));
}));

// Activity History
app.get('/items/:id/activity', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await loadItem(prisma, req.user, id, 'viewer');

  const events = await prisma.activityEvent.findMany({
    where: { itemId: id },
    orderBy: { id: 'asc' },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  res.json(events.map(e => ({
    id: e.id,
    item_id: e.itemId,
    user_id: e.userId,
    user_name: e.user.name,
    kind: e.kind,
    detail: e.detail,
    created_at: e.createdAt,
  })));
}));

// Comments
app.post('/items/:id/comments', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!req.body.text || !req.body.text.trim()) {
    throw new HttpError(400, 'text is required');
  }

  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, req.user, id, 'member');
    await tx.activityEvent.create({
      data: {
        itemId: item.id,
        userId: req.user.id,
        kind: 'comment',
        detail: { text: req.body.text.trim() },
      },
    });
  });

  res.status(201).json({ ok: true });
}));

// Edit Work Item (Optimistic Concurrency Control)
app.patch('/items/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const version = req.body.version;
  if (!Number.isInteger(version)) {
    throw new HttpError(400, 'version is required');
  }

  const out = await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, req.user, id, 'member');

    const updateData = {};
    const changes = {};

    if (req.body.title !== undefined) {
      updateData.title = req.body.title;
      changes.title = { from: item.title, to: req.body.title };
    }
    if (req.body.description !== undefined) {
      updateData.description = req.body.description;
      changes.description = { from: item.description, to: req.body.description };
    }
    if (req.body.priority !== undefined) {
      const p = String(req.body.priority).toLowerCase();
      if (!PRIORITIES.includes(p)) throw new HttpError(400, 'bad priority');
      updateData.priority = p;
      changes.priority = { from: item.priority, to: p };
    }
    if (req.body.due_date !== undefined || req.body.dueDate !== undefined) {
      const d = req.body.due_date !== undefined ? req.body.due_date : req.body.dueDate;
      updateData.dueDate = d ? new Date(d) : null;
      changes.due_date = { from: item.dueDate, to: d };
    }
    if (req.body.assignee_id !== undefined || req.body.assigneeId !== undefined) {
      need(req.user, item.teamId, 'lead'); // Only leads or admins can reassign
      const a = req.body.assignee_id !== undefined ? req.body.assignee_id : req.body.assigneeId;
      updateData.assigneeId = a ? Number(a) : null;
      changes.assignee_id = { from: item.assigneeId, to: a ? Number(a) : null };
    }

    if (Object.keys(updateData).length === 0) {
      return formatItem(item);
    }

    const result = await tx.workItem.updateMany({
      where: {
        id,
        version,
      },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await tx.workItem.findUnique({ where: { id } });
      throw new HttpError(409, 'this item changed, reload it', { current: formatItem(current) });
    }

    await tx.activityEvent.create({
      data: {
        itemId: id,
        userId: req.user.id,
        kind: 'updated',
        detail: changes,
      },
    });

    const updated = await tx.workItem.findUnique({
      where: { id },
      include: {
        team: true,
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    return formatItem(updated);
  });

  res.json(out);
}));

// Claim Work Item (Atomic Row-level Concurrency)
app.post('/items/:id/claim', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, req.user, id, 'member');

    const result = await tx.workItem.updateMany({
      where: {
        id,
        assigneeId: null,
        status: { not: 'closed' },
      },
      data: {
        assigneeId: req.user.id,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new HttpError(409, 'someone else already has this item');
    }

    await tx.activityEvent.create({
      data: {
        itemId: id,
        userId: req.user.id,
        kind: 'claimed',
        detail: { assignee_id: req.user.id },
      },
    });

    const updated = await tx.workItem.findUnique({
      where: { id },
      include: {
        team: true,
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    return formatItem(updated);
  });

  res.json(out);
}));

// Workflow Transitions
app.post('/items/:id/transition', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { to, version } = req.body;
  if (!Number.isInteger(version)) throw new HttpError(400, 'version is required');
  if (!to) throw new HttpError(400, 'to status is required');

  const out = await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, req.user, id, 'member');

    const allowed = FLOW[item.status] || [];
    if (!allowed.includes(to)) {
      throw new HttpError(422, `cannot move from ${item.status} to ${to}`);
    }

    // Lead or Admin required for approval to resolved
    if (item.status === 'awaiting_approval' && to === 'resolved') {
      need(req.user, item.teamId, 'lead');
    }

    const result = await tx.workItem.updateMany({
      where: {
        id,
        version,
      },
      data: {
        status: to,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await tx.workItem.findUnique({ where: { id } });
      throw new HttpError(409, 'this item changed, reload it', { current: formatItem(current) });
    }

    await tx.activityEvent.create({
      data: {
        itemId: id,
        userId: req.user.id,
        kind: 'status_changed',
        detail: { from: item.status, to },
      },
    });

    const updated = await tx.workItem.findUnique({
      where: { id },
      include: {
        team: true,
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    return formatItem(updated);
  });

  res.json(out);
}));

// Fallback to index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/items') || req.path.startsWith('/login') || req.path.startsWith('/me')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error(err);
  res.status(500).json({ error: 'something went wrong' });
});

module.exports = app;
