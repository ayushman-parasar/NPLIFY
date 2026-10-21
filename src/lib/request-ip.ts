/** The client's address as the proxy reports it. On Vercel every request carries x-forwarded-for (client first,
 *  then each hop) and x-real-ip; locally there is neither, so null. Stored with every logged action so the
 *  activity log can show where a session came from. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : null;
}
