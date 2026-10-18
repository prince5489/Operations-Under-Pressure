const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');

const prisma = new PrismaClient();
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ops' });

function formatItem(item) {
  if (!item) return null;
  return {
    ...item,
    team_id: item.teamId !== undefined ? item.teamId : item.team_id,
    assignee_id: item.assigneeId !== undefined ? item.assigneeId : item.assignee_id,
    created_by: item.createdById !== undefined ? item.createdById : item.created_by,
    due_date: item.dueDate !== undefined ? item.dueDate : item.due_date,
    created_at: item.createdAt !== undefined ? item.createdAt : item.created_at,
    updated_at: item.updatedAt !== undefined ? item.updatedAt : item.updated_at,
  };
}

module.exports = { prisma, pool, formatItem };
