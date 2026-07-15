import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'admin_session';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // The login page/route itself must stay reachable without a session.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = token ? await verifySession(token) : false;

  if (valid) return NextResponse.next();

  if (pathname.startsWith('/api/admin')) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const loginUrl = new URL('/admin/login', req.url);
  return NextResponse.redirect(loginUrl);
}

async function verifySession(token) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/get/admin_session:${token}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const data = await res.json();
    return Boolean(data.result);
  } catch {
    return false;
  }
}
