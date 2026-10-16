// Paystack sends the applicant here after paying (or cancelling). We check with Paystack,
// record the result, then send them back to their application page.
import { deps, verifyAndRecord, redirect } from "../lib/paystack.mjs";

export async function handleReturn(req, d) {
  const u = new URL(req.url);
  const reference = u.searchParams.get("reference") || u.searchParams.get("trxref");
  if (!reference) return redirect(`${u.origin}/#/paycheck`);
  try {
    const r = await verifyAndRecord(reference, d);
    const view = r.outcome === "success" ? "paid" : r.outcome === "mismatch" ? "paycheck" : "payfail";
    return redirect(`${u.origin}/#/a/${encodeURIComponent(r.ref)}/${encodeURIComponent(r.token)}/${view}`);
  } catch (e) {
    console.error("pay-return", reference, e.message);
    return redirect(`${u.origin}/#/paycheck`);
  }
}

export default (req) => handleReturn(req, deps());
