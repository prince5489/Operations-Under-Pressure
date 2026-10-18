const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database with Prisma...');

  // Clean existing data and restart identity sequences so IDs are deterministic
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE activity_events, idempotency_keys, work_items, memberships, teams, users RESTART IDENTITY CASCADE;'
  );

  const hash = bcrypt.hashSync('password123', 8);

  // 1. Teams
  const payments = await prisma.team.create({ data: { name: 'Payments' } });
  const support = await prisma.team.create({ data: { name: 'Support' } });
  const compliance = await prisma.team.create({ data: { name: 'Compliance' } });

  // 2. Users
  const alice = await prisma.user.create({ data: { name: 'alice', email: 'alice@demo.test', passwordHash: hash } });
  const bob = await prisma.user.create({ data: { name: 'bob', email: 'bob@demo.test', passwordHash: hash } });
  const carol = await prisma.user.create({ data: { name: 'carol', email: 'carol@demo.test', passwordHash: hash } });
  const dave = await prisma.user.create({ data: { name: 'dave', email: 'dave@demo.test', passwordHash: hash } });
  const erin = await prisma.user.create({ data: { name: 'erin', email: 'erin@demo.test', passwordHash: hash } });

  // 3. Memberships
  // Alice: Lead in Payments, Member in Support
  // Bob: Member in Payments
  // Carol: Lead in Support
  // Dave: Viewer in Payments
  // Erin: Admin in Payments, Support, Compliance
  const memberships = [
    { userId: alice.id, teamId: payments.id, role: 'lead' },
    { userId: alice.id, teamId: support.id, role: 'member' },
    { userId: bob.id, teamId: payments.id, role: 'member' },
    { userId: carol.id, teamId: support.id, role: 'lead' },
    { userId: dave.id, teamId: payments.id, role: 'viewer' },
    { userId: erin.id, teamId: payments.id, role: 'admin' },
    { userId: erin.id, teamId: support.id, role: 'admin' },
    { userId: erin.id, teamId: compliance.id, role: 'admin' },
  ];
  for (const m of memberships) {
    await prisma.membership.create({ data: m });
  }

  // 4. Sample Curated Work Items
  const curatedItems = [
    {
      title: 'Stripe webhook retry storm causing latency',
      description: 'Webhook processing backlog exceeded 15,000 events during peak hours.',
      type: 'incident',
      priority: 'urgent',
      status: 'open',
      teamId: payments.id,
      createdById: alice.id,
      assigneeId: null, // Unassigned Urgent
      dueDate: new Date(Date.now() + 2 * 3600 * 1000),
    },
    {
      title: 'Disputed chargeback threshold alert on merchant ACME',
      description: 'Account flagged for exceeding 1.2% dispute ratio in 30-day rolling window.',
      type: 'payment',
      priority: 'high',
      status: 'in_progress',
      teamId: payments.id,
      createdById: bob.id,
      assigneeId: alice.id, // Assigned to Alice
      dueDate: new Date(Date.now() + 24 * 3600 * 1000),
    },
    {
      title: 'Refund approval: Transaction TX_994821 over $10,000',
      description: 'Customer requested full refund due to accidental duplicate invoice settlement.',
      type: 'payment',
      priority: 'urgent',
      status: 'awaiting_approval',
      teamId: payments.id,
      createdById: bob.id,
      assigneeId: bob.id,
      dueDate: new Date(Date.now() + 12 * 3600 * 1000),
    },
    {
      title: 'High priority customer escalation: API key rotated unexpectedly',
      description: 'Enterprise client locked out of dashboard after rotating master credentials.',
      type: 'customer_issue',
      priority: 'urgent',
      status: 'open',
      teamId: support.id,
      createdById: carol.id,
      assigneeId: null, // Unassigned Urgent in Support
      dueDate: new Date(Date.now() + 4 * 3600 * 1000),
    },
    {
      title: 'Annual SOC2 audit evidence collection',
      description: 'Gather IAM role assignments, log retention policies, and change management approvals.',
      type: 'compliance',
      priority: 'normal',
      status: 'in_progress',
      teamId: compliance.id,
      createdById: erin.id,
      assigneeId: erin.id,
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
    {
      title: 'KYC remediation for tier-2 accounts',
      description: 'Verify utility bills and government IDs for 120 flagged business profiles.',
      type: 'compliance',
      priority: 'high',
      status: 'awaiting_approval',
      teamId: compliance.id,
      createdById: erin.id,
      assigneeId: erin.id,
      dueDate: new Date(Date.now() + 48 * 3600 * 1000),
    },
  ];

  for (const itemData of curatedItems) {
    const item = await prisma.workItem.create({ data: itemData });
    await prisma.activityEvent.create({
      data: {
        itemId: item.id,
        userId: item.createdById,
        kind: 'created',
        detail: { priority: item.priority, status: item.status },
      },
    });
  }

  // Generate pagination items
  const types = ['incident', 'customer_issue', 'payment', 'compliance', 'task'];
  const priorities = ['low', 'normal', 'high', 'urgent'];
  const statuses = ['open', 'in_progress', 'awaiting_approval', 'resolved', 'closed'];

  for (let i = 1; i <= 60; i++) {
    const tId = ((i % 3) === 0 ? payments.id : (i % 3 === 1 ? support.id : compliance.id));
    const creatorId = erin.id;
    const assigneeId = (i % 4 === 0) ? null : (i % 2 === 0 ? alice.id : bob.id);
    const itemPriority = priorities[i % 4];
    const itemStatus = statuses[i % 5];
    const item = await prisma.workItem.create({
      data: {
        title: `Ops Work Item #${i}: ${types[i % 5]} monitoring`,
        description: `Routine scheduled operations task #${i} for platform stability and compliance audit.`,
        type: types[i % 5],
        priority: itemPriority,
        status: itemStatus,
        teamId: tId,
        createdById: creatorId,
        assigneeId: assigneeId,
        dueDate: new Date(Date.now() + (i * 3600 * 1000)),
      },
    });
    await prisma.activityEvent.create({
      data: {
        itemId: item.id,
        userId: creatorId,
        kind: 'created',
        detail: { priority: item.priority },
      },
    });
  }

  console.log('Seeded: 5 users (password123), 3 teams, and work items with activity events.');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
