import React, { useState, useEffect } from 'react';
import { api, getStoredUser, setAuth } from './api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ItemDetails from './components/ItemDetails';
import ItemModal from './components/ItemModal';

const DEMO_USERS = [
  { name: 'Alice', email: 'alice@demo.test', role: 'Lead (Pay), Member (Supp)' },
  { name: 'Bob', email: 'bob@demo.test', role: 'Member (Pay)' },
  { name: 'Carol', email: 'carol@demo.test', role: 'Lead (Supp)' },
  { name: 'Dave', email: 'dave@demo.test', role: 'Viewer (Pay)' },
  { name: 'Erin', email: 'erin@demo.test', role: 'Admin (All)' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [teams, setTeams] = useState([]);
  const [currentView, setCurrentView] = useState('assigned_to_me');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState({
    assigned_to_me: 0,
    unassigned_urgent: 0,
    awaiting_my_approval: 0,
  });

  const loadInitialData = async () => {
    try {
      const [meRes, teamsRes] = await Promise.all([
        api.getMe(),
        api.getTeams(),
      ]);
      setCurrentUser(meRes);
      setTeams(teamsRes);

      // Fetch counts for sidebar badges
      const [assignedRes, urgentRes, approvalRes] = await Promise.all([
        api.getItems({ view: 'assigned_to_me', limit: 1 }),
        api.getItems({ view: 'unassigned_urgent', limit: 1 }),
        api.getItems({ view: 'awaiting_my_approval', limit: 1 }),
      ]);
      setBadgeCounts({
        assigned_to_me: assignedRes.total || 0,
        unassigned_urgent: urgentRes.total || 0,
        awaiting_my_approval: approvalRes.total || 0,
      });
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
      }
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadInitialData();
    }
  }, [currentUser?.id]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setAuth(null, null);
    setCurrentUser(null);
    setSelectedItemId(null);
    setEditingItem(null);
    setIsCreating(false);
  };

  const handleQuickSwitchUser = async (email) => {
    try {
      const res = await api.login(email, 'password123');
      setCurrentUser(res.user);
    } catch (err) {
      alert('Failed to switch user');
    }
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">
            <span style={{ fontSize: '1.25rem' }}>⚡</span>
            <span>Newtonite Ops</span>
          </div>
          <div className="sidebar-subtitle">Operations Under Pressure</div>
        </div>

        <div className="sidebar-content">
          <div className="nav-section-title">Views</div>
          <button
            className={`nav-item ${currentView === 'assigned_to_me' ? 'active' : ''}`}
            onClick={() => setCurrentView('assigned_to_me')}
          >
            <span>Assigned to Me</span>
            <span className="nav-count">{badgeCounts.assigned_to_me}</span>
          </button>
          <button
            className={`nav-item ${currentView === 'unassigned_urgent' ? 'active' : ''}`}
            onClick={() => setCurrentView('unassigned_urgent')}
          >
            <span>Unassigned Urgent</span>
            <span className="nav-count">{badgeCounts.unassigned_urgent}</span>
          </button>
          <button
            className={`nav-item ${currentView === 'awaiting_my_approval' ? 'active' : ''}`}
            onClick={() => setCurrentView('awaiting_my_approval')}
          >
            <span>Awaiting My Approval</span>
            <span className="nav-count">{badgeCounts.awaiting_my_approval}</span>
          </button>
          <button
            className={`nav-item ${currentView === 'all' ? 'active' : ''}`}
            onClick={() => setCurrentView('all')}
          >
            <span>All Work Items</span>
          </button>

          <div style={{ marginTop: '20px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px' }}
              onClick={() => setIsCreating(true)}
            >
              + Create Work Item
            </button>
          </div>

          {/* Quick Demo User Switcher inside Sidebar */}
          <div style={{ marginTop: '30px' }}>
            <div className="nav-section-title">Switch Demo Role</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 4px' }}>
              {DEMO_USERS.map((u) => {
                const isSelected = currentUser.email === u.email;
                return (
                  <button
                    key={u.email}
                    onClick={() => handleQuickSwitchUser(u.email)}
                    style={{
                      background: isSelected ? '#334155' : 'transparent',
                      border: isSelected ? '1px solid #475569' : '1px solid transparent',
                      borderRadius: '6px',
                      color: isSelected ? '#ffffff' : '#94a3b8',
                      padding: '6px 8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: isSelected ? '#60a5fa' : '#cbd5e1' }}>{u.name}</strong>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{u.role}</div>
                    </div>
                    {isSelected && <span style={{ color: '#60a5fa', fontSize: '0.75rem' }}>Active</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar Footer with current user info */}
        <div className="sidebar-footer">
          <div className="user-profile">
            <div>
              <div className="user-name">{currentUser.name}</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{currentUser.email}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
              {currentUser.teams?.slice(0, 2).map((t) => (
                <span key={t.id} className="user-role-badge">
                  {t.name}: {t.role}
                </span>
              ))}
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <Dashboard
          key={`${currentUser.id}-${currentView}`}
          currentView={currentView}
          currentUser={currentUser}
          teams={teams}
          onSelectItem={(id) => setSelectedItemId(id)}
          onEditItem={(item) => setEditingItem(item)}
          onOpenCreate={() => setIsCreating(true)}
        />
      </main>

      {/* Details View Modal */}
      {selectedItemId && (
        <ItemDetails
          itemId={selectedItemId}
          currentUser={currentUser}
          onClose={() => setSelectedItemId(null)}
          onUpdated={() => {
            loadInitialData();
          }}
          onEdit={(item) => {
            setSelectedItemId(null);
            setEditingItem(item);
          }}
        />
      )}

      {/* Create / Edit Modal */}
      {(isCreating || editingItem) && (
        <ItemModal
          item={editingItem}
          teams={teams}
          currentUser={currentUser}
          onClose={() => {
            setIsCreating(false);
            setEditingItem(null);
          }}
          onSaved={() => {
            setIsCreating(false);
            setEditingItem(null);
            loadInitialData();
          }}
        />
      )}
    </div>
  );
}
