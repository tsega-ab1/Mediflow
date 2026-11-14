'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, homeFor } from '../../lib/api';
import { Notice } from '../../components/Shell';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      router.replace(homeFor(user.role));
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="card login" onSubmit={submit}>
      <h1>MediFlow</h1>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <Notice error={error} />
      <button type="submit">Log in</button>
    </form>
  );
}
