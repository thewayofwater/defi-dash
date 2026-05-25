import handler from "../api/usdai.js";

const res = {
  _status: 200, _body: null, _headers: {},
  setHeader(k,v){ this._headers[k]=v; },
  status(c){ this._status=c; return this; },
  json(b){ this._body=b; return this; },
};
await handler({}, res);

const d = res._body;
console.log("status:", res._status);
console.log("warnings:", d.warnings);
console.log("kpis:", d.kpis);
console.log("reserves:", d.reserves);
console.log("loans count:", d.loans?.length);
console.log("tbills count:", d.tbills?.length);
console.log("tvlHistory points:", d.tvlHistory?.length);
if (d.tvlHistory?.length) {
  const first = d.tvlHistory[0], last = d.tvlHistory[d.tvlHistory.length-1];
  console.log("  first:", new Date(first.date).toISOString().slice(0,10), `stable=${first.stablecoin?.toFixed(0)} loans=${first.loans?.toFixed(0)}`);
  console.log("  last: ", new Date(last.date).toISOString().slice(0,10),  `stable=${last.stablecoin?.toFixed(0)} loans=${last.loans?.toFixed(0)}`);
}

const required = ["updatedAt", "kpis", "reserves", "tvlHistory", "loans", "tbills", "gpuRentals", "warnings"];
const missing = required.filter(k => !(k in d));
if (missing.length) { console.error("MISSING keys:", missing); process.exit(1); }

if (!d.loans || d.loans.length === 0) { console.error("no loans"); process.exit(1); }
const firstLoan = d.loans[0];
for (const f of ["documentId", "name", "stage", "principal", "apr", "termDays", "hardware"]) {
  if (!(f in firstLoan)) { console.error("loan missing field:", f); process.exit(1); }
}

const deployedCount = d.loans.filter(l => l.isDeployed).length;
const upcomingCount = d.loans.filter(l => !l.isDeployed).length;
console.log(`deployed=${deployedCount} upcoming=${upcomingCount}`);

const withAttested = d.loans.filter(l => l.attestedUsd != null).length;
const fromNft     = d.loans.filter(l => l.attestedSource === "nft").length;
const fromRepl    = d.loans.filter(l => l.attestedSource === "replacement-cost").length;
console.log(`loans with attestedUsd: ${withAttested}/${d.loans.length} (nft=${fromNft}, replacement-cost=${fromRepl})`);
if (withAttested === 0) { console.error("ZERO loans got attestedUsd — join is broken"); process.exit(1); }

console.log("gpuRentals keys:", Object.keys(d.gpuRentals));
const populated = Object.values(d.gpuRentals).filter(v => v.medianDph != null);
console.log(`gpuRentals with medianDph: ${populated.length}/${Object.keys(d.gpuRentals).length}`);
for (const [k, v] of Object.entries(d.gpuRentals)) {
  console.log(`  ${k}: median=$${v.medianDph?.toFixed(2)} listings=${v.listingCount}`);
}
if (populated.length === 0) console.warn("WARN: zero Vast.ai medians populated (may be transient)");

console.log("first loan:", JSON.stringify(firstLoan, null, 2));
console.log("OK");
