import { NextResponse, type NextRequest } from 'next/server';

// const [AUTH_USER, AUTH_PASS] = (process.env.HTTP_BASIC_AUTH || ':').split(':');
const AUTH_USER = 'cz';
const AUTH_PASS = '4';

// Step 2. Check HTTP Basic Auth header if present
function isAuthenticated(req: NextRequest) {
  const authheader =
    req.headers.get('authorization') || req.headers.get('Authorization');

  if (!authheader) {
    return false;
  }

  const auth = Buffer.from(authheader.split(' ')[1], 'base64')
    .toString()
    .split(':');
  const user = auth[0];
  const pass = auth[1];

  return user === AUTH_USER && pass === AUTH_PASS;
}

export function middleware(request: NextRequest) {
  // Call our authentication function to check the request
  if (!isAuthenticated(request)) {
    // Respond with JSON indicating an error message
    return Response.json(
      { success: false, message: 'authentication failed' },
      { status: 401 }
    );
  }
  return NextResponse.next();
}

// Step 3. Configure "Matching Paths" below to protect routes with HTTP Basic Auth
export const config = {
  matcher: '/:path*',
};
