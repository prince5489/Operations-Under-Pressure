import React, { useState, useEffect } from 'react';
import { api } from '../api';

const TYPES = [
  { value: 'incident', label: 'Incident' },
  { value: 'customer_issue', label: 'Customer Issue' },
  { value: 'payment', label: 'Payment' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'task', label: 'Task' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function ItemModal({ item, teams, currentUser, onClose, onSaved }) {
  const isEditing = Boolean(item);

  const [title, setTitle] = useState(item ? item.title : '');
  const [description, setDescription] = useState(item ? item.description || '' : '');
  const [type, setType] = useState(item ? item.type : 'task');
  const [priority, setPriority] = useState(item ? item.priority : 'normal');
  const [teamId, setTeamId] = useState(item ? item.team_id : (teams[0]?.id || ''));
  const [assigneeId, setAssigneeId] = useState(item ? (item.assignee_id || '') : '');
  const [dueDate, setDueDate] = useState(
    item && item.due_date ? new Date(item.due_date).toISOString().slice(0, 16) : ''
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Determine current user's role in selected team
  const currentTeamMembership = currentUser?.teams?.find(
    (t) => String(t.id) === String(teamId)
  );
  const userRole = currentTeamMembership?.role?.toLowerCase() || '';
  const isLeadOrAdmin = ['lead', 'admin'].includes(userRole);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!teamId) {
      setError('Please select a team');
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        // Send optimistic version
        const payload = {
          version: item.version,
          title: title.trim(),
          description: description.trim(),
          priority,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        };

        // Only leads or admins can reassign
        if (isLeadOrAdmin) {
          payload.assignee_id = assigneeId ? Number(assigneeId) : null;
        }

        const updated = await api.updateItem(item.id, payload);
        onSaved(updated);
      } else {
        // Generate a unique idempotency key for this creation action
        const idempotencyKey = `create-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const payload = {
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          team_id: Number(teamId),
          assignee_id: assigneeId ? Number(assigneeId) : null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        };

        const created = await api.createItem(payload, idempotencyKey);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      if (err.status === 409) {
        setError('Conflict (409): This item was modified by another user. Please reload current version.');
      } else {
        setError(err.message || 'Operation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Find candidate members for selected team
  const selectedTeamObj = teams.find((t) => String(t.id) === String(teamId));
  const candidateAssignees = selectedTeamObj?.memberships?.map((m) => m.user) || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isEditing ? `Edit Work Item #${item.id}` : 'Create New Work Item'}
          </h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="form-group">
              <label className="form-label">Title *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Stripe webhook retry storms"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select
                  className="form-control"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={isEditing}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority *</label>
                <select
                  className="form-control"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Team *</label>
                <select
                  className="form-control"
                  value={teamId}
                  onChange={(e) => {
                    setTeamId(e.target.value);
                    setAssigneeId('');
                  }}
                  disabled={isEditing}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Assignee {isEditing && !isLeadOrAdmin && '(Lead/Admin only)'}
                </label>
                <select
                  className="form-control"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={isEditing && !isLeadOrAdmin}
                >
                  <option value="">Unassigned</option>
                  {candidateAssignees.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input
                type="datetime-local"
                className="form-control"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Details, incident response notes, or steps to reproduce..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {isEditing && (
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Current Version: <strong>{item.version}</strong> (Protected with Optimistic Locking)
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
