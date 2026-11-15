export function getSession() {
  try {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return token && user ? { token, user } : null;
  } catch { return null; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    localStorage.clear();
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export async function downloadFile(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export const money = (cents) => (cents / 100).toFixed(2);
export const day = (d) => String(d).slice(0, 10);
export const when = (d) => new Date(d).toLocaleString();
export const homeFor = (role) =>
  ({ customer: '/shop', warehouse: '/fulfillment', inventory_manager: '/inventory', admin: '/admin' })[role] || '/login';
