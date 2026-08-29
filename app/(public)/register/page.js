'use client';

import { useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

export default function RegisterPage() {
  const supabase = createClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.toLowerCase().trim().endsWith('@linney.com')) {
      setError('Registration is only open to @linney.com email addresses.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main>
        <div className="panel success-panel" style={{ maxWidth: 420, margin: '40px auto' }}>
          <h2>Check your email</h2>
          <p className="hint">
            We've sent a confirmation link to {email}. Click it to activate your account, then sign in.
            Note: a new account starts with no dashboard access until an admin assigns it to a client group.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="panel" style={{ maxWidth: 380, margin: '40px auto' }}>
        <h2>Create an Account</h2>
        <p className="hint">Open to @linney.com email addresses only.</p>
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1 1 100%' }}>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@linney.com" />
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
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
