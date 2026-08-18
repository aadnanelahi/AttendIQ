import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

export function middleware(req: NextRequest): NextResponse | undefined {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('attendiq_token')?.value;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !token && pathname !== '/') {
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (isPublic && token) {
    const dash = req.nextUrl.clone();
    dash.pathname = '/dashboard';
    return NextResponse.redirect(dash);
  }

  return undefined;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)'],
};
