import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/theme';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      await router.push('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper }}>
      <Head>
        <title>Email platform admin</title>
      </Head>
      <form onSubmit={handleSubmit} style={{ width: 320, padding: 40, background: T.white, border: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 18, fontWeight: 700, display: 'block', marginBottom: 24, textAlign: 'center' }}>Email platform</span>
        <p style={{ ...S.label, marginBottom: 16, textAlign: 'center' }}>Admin</p>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%', height: 44, padding: '0 14px', border: `1px solid ${T.line}`, background: T.white,
            fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
          }}
          autoFocus
          required
        />
        {error && <p style={{ color: '#b3261e', fontSize: 13, marginTop: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{ ...S.btnFill, width: '100%', justifyContent: 'center', marginTop: 20, opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
