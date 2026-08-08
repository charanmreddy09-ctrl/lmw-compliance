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
  /* Any static image in /public must stay reachable by a signed-out visitor -
     the signin page's own logo is one, and this previously only excluded
     company-logo.png by exact name, so the signin page's actual logo asset
     was silently redirected through the auth guard back to /signin itself,
     rendering as a broken image stretched into its fixed box. Excluding by
     extension covers every current and future asset in /public instead of
     requiring each filename to be added here by hand. */
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)'],
};
