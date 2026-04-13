import { NextRequest, NextResponse } from "next/server";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i]! ^ bb[i]!;
  }
  return diff === 0;
}

function basicAuthExpectedHeader(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `Basic ${btoa(binary)}`;
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  if (!url.pathname.startsWith("/dashboard")) {
    return withSecurityHeaders(NextResponse.next());
  }

  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;

  if (!user || !pass) {
    return new NextResponse("Dashboard auth not configured", { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const expected = basicAuthExpectedHeader(user, pass);

  if (!constantTimeEqual(auth, expected)) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="InspectFlow Dashboard"',
      },
    });
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
