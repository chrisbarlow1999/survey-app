import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function proxy(request) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Plural forms only — '/visit' and '/install' are the PUBLIC engineer forms
  // and must stay open. ('/visit'.startsWith('/visits') is false, so they don't
  // get caught by these prefixes.)
  const needsSession = ['/dashboard', '/admin', '/installations', '/sites', '/visits', '/projects'].some((p) => request.nextUrl.pathname.startsWith(p));
  if (needsSession && !session) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/installations/:path*', '/sites/:path*', '/visits/:path*', '/projects/:path*'],
};
