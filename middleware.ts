import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Basic auth attendu pour comparaison (UTF-8 safe, sans Buffer — Edge). */
function basicAuthExpectedHeader(user: string, pass: string): string {
  const credentials = `${user}:${pass}`;
  const bytes = new TextEncoder().encode(credentials);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `Basic ${btoa(binary)}`;
}

export function middleware(req: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;

  if (!user || !pass) {
    return new NextResponse("Dashboard auth not configured", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const auth = req.headers.get("authorization");
  const expected = basicAuthExpectedHeader(user, pass);

  if (auth !== expected) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="InspectFlow Dashboard"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
