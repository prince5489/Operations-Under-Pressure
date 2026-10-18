import React, { useState, useEffect } from 'react';
import { api } from '../api';

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  awaiting_approval: 'Awaiting Approval',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function Dashboard({
  currentView,
  currentUser,
  teams,
  onSelectItem,
  onEditItem,
  onOpenCreate,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchItems = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        limit: 15,
        page,
      };

      if (currentView && currentView !== 'all') {
        params.view = currentView;
      }
      if (search.trim()) {
        params.q = search.trim();
      }
      if (statusFilter) {
        params.status = statusFilter;
      }
      if (priorityFilter) {
        params.priority = priorityFilter;
      }
      if (typeFilter) {
        params.type = typeFilter;
      }
      if (teamFilter) {
        params.team_id = teamFilter;
      }

      const res = await api.getItems(params);
      setItems(res.items || []);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to fetch work items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [currentView, search, statusFilter, priorityFilter, typeFilter, teamFilter]);

  useEffect(() => {
    fetchItems();
  }, [currentView, search, statusFilter, priorityFilter, typeFilter, teamFilter, page]);

  const handleClaim = async (e, item) => {
    e.stopPropagation();
    try {
      await api.claimItem(item.id);
      fetchItems();
    } catch (err) {
      alert(err.message || 'Could not claim item');
    }
  };

  const getPageTitle = () => {
    switch (currentView) {
      case 'assigned_to_me':
        return 'Assigned to Me';
      case 'unassigned_urgent':
        return 'Unassigned Urgent Items';
      case 'awaiting_my_approval':
        return 'Awaiting My Approval';
      default:
        return 'All Operations Work Items';
    }
  };

  return (
    <div>
      <div className="top-bar">
        <div>
          <h1 className="page-title">{getPageTitle()}</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Showing {items.length} of {totalCount} operational items
          </p>
        </div>
        <div className="top-bar-actions">
          <button className="btn btn-primary" onClick={onOpenCreate}>
            + Create Work Item
          </button>
        </div>
      </div>

      <div className="content-body">
        {error && <div className="alert alert-danger">{error}</div>}

        {/* Filter Controls */}
        <div className="filter-card">
          <input
            type="text"
            className="search-input"
            placeholder="Search by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="awaiting_approval">Awaiting Approval</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            className="filter-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="incident">Incident</option>
            <option value="customer_issue">Customer Issue</option>
            <option value="payment">Payment</option>
            <option value="compliance">Compliance</option>
            <option value="task">Task</option>
          </select>

          <select
            className="filter-select"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {(search || statusFilter || priorityFilter || typeFilter || teamFilter) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setPriorityFilter('');
                setTypeFilter('');
                setTeamFilter('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Work Items Table */}
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Team</th>
                <th>Assignee</th>
                <th>Due</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Loading work items...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No work items found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const canClaim = !item.assignee_id && item.status !== 'closed';
                  return (
                    <tr key={item.id} onClick={() => onSelectItem(item.id)} style={{ cursor: 'pointer' }}>
                      <td className="item-id">#{item.id}</td>
                      <td>
                        <div className="item-title">{item.title}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', textTransform: 'capitalize', color: 'var(--text-sub)' }}>
                          {item.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-prio-${item.priority}`}>{item.priority}</span>
                      </td>
                      <td>
                        <span className={`badge badge-status-${item.status}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {item.team?.name || `Team #${item.team_id}`}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: item.assignee?.name ? 'inherit' : '#94a3b8' }}>
                          {item.assignee?.name || 'Unassigned'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {item.due_date ? new Date(item.due_date).toLocaleDateString() : '-'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        v{item.version}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {canClaim && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={(e) => handleClaim(e, item)}
                            >
                              Claim
                            </button>
                          )}
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => onSelectItem(item.id)}
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Server-Side Pagination Bar */}
          <div className="pagination-bar">
            <div>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalCount} total items)
            </div>
            <div className="pagination-controls">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || loading}
              >
                &larr; Previous
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages || loading}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
