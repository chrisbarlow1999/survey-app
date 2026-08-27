'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Could not sign in — check your email and password.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main>
      <div className="panel" style={{ maxWidth: 380, margin: '40px auto' }}>
        <h2>Dashboard Sign In</h2>
        <p className="hint">Accounts are created by your admin — there's no public sign-up.</p>
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="actions-row">
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
