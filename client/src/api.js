const API_BASE = '';

function getToken() {
  return localStorage.getItem('ops_token');
}

export function setAuth(token, user) {
  if (token) {
    localStorage.setItem('ops_token', token);
    localStorage.setItem('ops_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('ops_token');
    localStorage.removeItem('ops_user');
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('ops_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  async login(email, password) {
    const res = await request('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuth(res.token, res.user);
    return res;
  },

  async getMe() {
    return request('/me');
  },

  async getTeams() {
    return request('/teams');
  },

  async getUsers() {
    return request('/users');
  },

  async getItems(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v);
      }
    });
    return request(`/items?${query.toString()}`);
  },

  async getItem(id) {
    return request(`/items/${id}`);
  },

  async createItem(itemData, idempotencyKey) {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return request('/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(itemData),
    });
  },

  async updateItem(id, itemData) {
    return request(`/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(itemData),
    });
  },

  async claimItem(id) {
    return request(`/items/${id}/claim`, {
      method: 'POST',
    });
  },

  async transitionItem(id, to, version) {
    return request(`/items/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to, version }),
    });
  },

  async getActivity(id) {
    return request(`/items/${id}/activity`);
  },

  async addComment(id, text) {
    return request(`/items/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
};
