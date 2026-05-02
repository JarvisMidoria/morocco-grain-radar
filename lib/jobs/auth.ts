import type { NextRequest } from "next/server";

export function authorizeJobsRequest(request: NextRequest) {
  const expectedToken = process.env.RADAR_JOB_TOKEN?.trim();
  if (!expectedToken) {
    return true;
  }

  const providedToken =
    request.headers.get("x-radar-job-token")?.trim() ??
    request.nextUrl.searchParams.get("token")?.trim() ??
    "";

  return providedToken === expectedToken;
}
