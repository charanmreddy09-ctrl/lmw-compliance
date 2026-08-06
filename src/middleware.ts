/* Route protection at the edge. The JWT is verified without a database call,
   so an unauthenticated request never reaches a page or an API route. */
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PAGES = ['/', '/signin'];
const PUBLIC_API = ['/api/auth/login', '/api/auth/me', '/api/auth/logout'];

async function valid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get('sgcmp_session')?.value;
  const signedIn = await valid(token);

  if (PUBLIC_API.some(p => pathname === p)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    if (!signedIn) {
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.includes(pathname)) {
    // already signed in? send them into the application
    if (signedIn && pathname === '/signin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (!signedIn) {
    const url = new URL('/signin', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|company-logo.png).*)'],
};
