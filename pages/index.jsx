import Head from 'next/head';
import Link from 'next/link';
import { T, S } from '../lib/theme';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper }}>
      <Head>
        <title>Email platform</title>
      </Head>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Email platform</h1>
        <p style={{ color: T.soft, marginTop: 10 }}>Subscriber, campaign, and automation management.</p>
        <Link href="/admin" style={{ ...S.btnOutline, marginTop: 20, textDecoration: 'none' }}>Go to admin</Link>
      </div>
    </div>
  );
}
