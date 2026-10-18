import React, { useState } from 'react';
import { api } from '../api';

const DEMO_USERS = [
  { name: 'Alice', email: 'alice@demo.test', roleDesc: 'Lead (Payments), Member (Support)' },
  { name: 'Bob', email: 'bob@demo.test', roleDesc: 'Member (Payments)' },
  { name: 'Carol', email: 'carol@demo.test', roleDesc: 'Lead (Support)' },
  { name: 'Dave', email: 'dave@demo.test', roleDesc: 'Viewer (Payments)' },
  { name: 'Erin', email: 'erin@demo.test', roleDesc: 'Admin (All Teams)' },
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('alice@demo.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSelect = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
    // Auto-login with demo user
    setLoading(true);
    api.login(demoEmail, 'password123')
      .then((res) => onLoginSuccess(res.user))
      .catch((err) => setError(err.message || 'Demo login failed'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Operations Under Pressure</h1>
          <p className="login-desc">Newtonite Cross-Team Operational Command Center</p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="demo-users-box">
          <div className="demo-title">Quick Demo Sign-In (Click to Switch)</div>
          <div className="demo-grid">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                className="demo-btn"
                onClick={() => handleDemoSelect(u.email)}
              >
                <strong>{u.name}</strong>
                <span className="demo-role">{u.roleDesc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
