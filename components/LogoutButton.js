'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export function LogoutButton({ name }) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <>
      {name && <div className="sidebar-account-name">{name}</div>}
      <button className="sidebar-footer-link" onClick={handleLogout} disabled={loading}>
        {loading ? 'Signing out…' : 'Log Out'}
      </button>
    </>
  );
}
