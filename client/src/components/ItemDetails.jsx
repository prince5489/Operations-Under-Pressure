import React, { useState, useEffect } from 'react';
import { api } from '../api';

const STATUS_STEPS = ['open', 'in_progress', 'awaiting_approval', 'resolved', 'closed'];

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  awaiting_approval: 'Awaiting Approval',
  resolved: 'Resolved',
  closed: 'Closed',
};

const FLOW = {
  open: ['in_progress'],
  in_progress: ['open', 'awaiting_approval'],
  awaiting_approval: ['in_progress', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

export default function ItemDetails({ itemId, currentUser, onClose, onUpdated, onEdit }) {
  const [item, setItem] = useState(null);
  const [activity, setActivity] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
      const [itemData, activityData] = await Promise.all([
        api.getItem(itemId),
        api.getActivity(itemId),
      ]);
      setItem(itemData);
      setActivity(activityData);
    } catch (err) {
      setError(err.message || 'Failed to load item details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [itemId]);

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-card" style={{ padding: '40px', textAlign: 'center' }}>
          <div>Loading work item #{itemId}...</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" style={{ padding: '30px' }} onClick={(e) => e.stopPropagation()}>
          <div className="alert alert-danger">{error || 'Item not found or access denied'}</div>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  // Determine user's role in this item's team
  const userTeamMembership = currentUser?.teams?.find(
    (t) => String(t.id) === String(item.team_id || item.teamId)
  );
  const userRole = userTeamMembership?.role?.toLowerCase() || '';
  const isMember = ['member', 'lead', 'admin'].includes(userRole);
  const isLeadOrAdmin = ['lead', 'admin'].includes(userRole);

  const handleClaim = async () => {
    setActionLoading(true);
    setError('');
    try {
      const updated = await api.claimItem(item.id);
      setItem(updated);
      await loadData();
      onUpdated(updated);
    } catch (err) {
      if (err.status === 409) {
        setError('Claim Conflict (409): Another user already claimed this item!');
      } else {
        setError(err.message || 'Failed to claim item');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransition = async (toStatus) => {
    setActionLoading(true);
    setError('');
    try {
      const updated = await api.transitionItem(item.id, toStatus, item.version);
      setItem(updated);
      await loadData();
      onUpdated(updated);
    } catch (err) {
      if (err.status === 409) {
        setError('Stale Version Conflict (409): The item was updated by someone else. Reloading...');
        await loadData();
      } else if (err.status === 403) {
        setError('Forbidden (403): Only a Team Lead or Admin can approve items.');
      } else if (err.status === 422) {
        setError(`Invalid Transition (422): Cannot move from ${item.status} to ${toStatus}.`);
      } else {
        setError(err.message || 'Failed to update workflow status');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setActionLoading(true);
    setError('');
    try {
      await api.addComment(item.id, commentText.trim());
      setCommentText('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to add comment');
    } finally {
      setActionLoading(false);
    }
  };

  const allowedTransitions = FLOW[item.status] || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="item-id">WORK ITEM #{item.id}</span>
            <h2 className="modal-title" style={{ marginTop: '2px' }}>{item.title}</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isMember && (
              <button className="btn btn-outline btn-sm" onClick={() => onEdit(item)}>
                Edit Details
              </button>
            )}
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}

          {/* Status Pipeline Visualizer */}
          <div className="status-flow-bar">
            {STATUS_STEPS.map((s, idx) => {
              const isCurrent = item.status === s;
              const isPast = STATUS_STEPS.indexOf(item.status) > idx;
              return (
                <React.Fragment key={s}>
                  <div className={`flow-step ${isCurrent ? 'active' : ''}`} style={{ opacity: isCurrent || isPast ? 1 : 0.4 }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isCurrent ? 'var(--primary)' : (isPast ? '#10b981' : '#cbd5e1')
                    }} />
                    <span>{STATUS_LABELS[s]}</span>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && <span className="flow-arrow">&rarr;</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* Workflow Actions */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#f1f5f9',
            borderRadius: 'var(--radius)'
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginRight: '6px' }}>
              Workflow Actions:
            </span>

            {/* Claim button if unassigned */}
            {!item.assignee_id && item.status !== 'closed' && isMember && (
              <button
                className="btn btn-success btn-sm"
                onClick={handleClaim}
                disabled={actionLoading}
              >
                Claim This Item
              </button>
            )}

            {/* Allowed transitions */}
            {allowedTransitions.map((target) => {
              const isApproval = item.status === 'awaiting_approval' && target === 'resolved';
              const canApprove = !isApproval || isLeadOrAdmin;

              let btnClass = 'btn-outline';
              let label = `Move to ${STATUS_LABELS[target]}`;

              if (target === 'in_progress') {
                btnClass = 'btn-primary';
                label = 'Start Work';
              } else if (target === 'awaiting_approval') {
                btnClass = 'btn-primary';
                label = 'Submit for Lead Approval';
              } else if (target === 'resolved') {
                btnClass = 'btn-success';
                label = 'Approve & Mark Resolved';
              } else if (target === 'closed') {
                btnClass = 'btn-outline';
                label = 'Close Item';
              }

              return (
                <button
                  key={target}
                  className={`btn ${btnClass} btn-sm`}
                  onClick={() => handleTransition(target)}
                  disabled={actionLoading || !canApprove}
                  title={!canApprove ? 'Lead role required to approve' : ''}
                >
                  {label}
                  {isApproval && !canApprove && ' (Lead required)'}
                </button>
              );
            })}

            {allowedTransitions.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Item is in final state ({item.status}).</span>
            )}
          </div>

          {/* Item Meta Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            padding: '16px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius)',
            marginBottom: '20px'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</span>
              <div style={{ marginTop: '4px' }}>
                <span className={`badge badge-status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Priority</span>
              <div style={{ marginTop: '4px' }}>
                <span className={`badge badge-prio-${item.priority}`}>{item.priority}</span>
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type</span>
              <div style={{ marginTop: '4px', textTransform: 'capitalize', fontWeight: 500 }}>
                {item.type.replace('_', ' ')}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Version</span>
              <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                v{item.version}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Team</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {item.team?.name || `Team #${item.team_id}`}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assignee</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {item.assignee?.name ? item.assignee.name : <em style={{ color: '#94a3b8' }}>Unassigned</em>}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Created By</span>
              <div style={{ marginTop: '4px', fontWeight: 500 }}>
                {item.creator?.name || 'System'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Due Date</span>
              <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                {item.due_date ? new Date(item.due_date).toLocaleDateString() : '-'}
              </div>
            </div>
          </div>

          {/* Description */}
          {item.description && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '0.875rem', marginBottom: '6px', color: '#334155' }}>Description</h4>
              <p style={{
                fontSize: '0.875rem',
                backgroundColor: '#f8fafc',
                padding: '12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                whiteSpace: 'pre-wrap'
              }}>
                {item.description}
              </p>
            </div>
          )}

          {/* Comments & Activity Tabs / Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            {/* Activity History */}
            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                Activity Audit Log ({activity.length})
              </h4>
              <div className="timeline">
                {activity.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No activity logged yet.</div>
                ) : (
                  activity.map((ev) => (
                    <div key={ev.id} className="timeline-item">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>
                          {ev.user_name || 'User'} &bull; <span style={{ textTransform: 'capitalize' }}>{ev.kind.replace('_', ' ')}</span>
                        </div>
                        <div style={{ color: '#475569', marginTop: '2px' }}>
                          {ev.kind === 'created' && `Created item with priority ${ev.detail?.priority || 'normal'}`}
                          {ev.kind === 'claimed' && 'Claimed work item'}
                          {ev.kind === 'status_changed' && `Changed status from ${STATUS_LABELS[ev.detail?.from] || ev.detail?.from} to ${STATUS_LABELS[ev.detail?.to] || ev.detail?.to}`}
                          {ev.kind === 'updated' && `Updated fields: ${Object.keys(ev.detail || {}).join(', ')}`}
                          {ev.kind === 'comment' && `"${ev.detail?.text}"`}
                        </div>
                        <div className="timeline-meta" style={{ marginTop: '4px' }}>
                          {new Date(ev.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Comments Box */}
            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>Add Comment</h4>
              {isMember ? (
                <form onSubmit={handleAddComment} style={{ marginTop: '10px' }}>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Add operational notes or update comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: '8px', width: '100%' }}
                    disabled={actionLoading || !commentText.trim()}
                  >
                    Post Comment
                  </button>
                </form>
              ) : (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>
                  Viewer role is read-only.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
