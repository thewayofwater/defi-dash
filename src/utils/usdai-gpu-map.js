// USDai hardware-label → market metadata.
// Update replacementCost quarterly from NVIDIA list / OEM channel pricing.
// `vast` = Vast.ai `gpu_name` enum value; null means no rental data available.
// `life` = default useful life in years for this model (slider overrideable).

// Vast.ai gpu_name values use spaces (verified via live enumeration), e.g.
// "RTX 5090", "H100 SXM", "RTX PRO 6000 S". We pick the most common variant
// per model.
//
// `vastProxy` lets a GPU that has no Vast.ai listings (typically a brand-new
// generation like B300) borrow the rental rate from a closely related GPU
// (e.g. B200, same architecture family) as a stand-in. The UI labels these
// rows as "(<proxy> proxy)" so users know the rental rate isn't native.
//
// `orn` = ORN Compute Index gpu name (api.ornnai.com). ORN is the PRIMARY
// rental-rate source for institutional DC GPUs (it natively covers H100/H200/
// B200/A100/RTX 5090 with 90-day daily history). Vast.ai is the fallback /
// cross-check, and the only source for workstation cards (RTX PRO 6000).
// `ornProxy` works like vastProxy — B300 borrows B200's ORN index.
// ORN supported models (verified): "H100 SXM", "H200", "B200", "A100 SXM4", "RTX 5090".
export const USDAI_GPU_MAP = {
  "H100":                    { orn: "H100 SXM",  vast: "H100 SXM",  life: 4, replacementCost: 27_000 },
  "H100 SXM":                { orn: "H100 SXM",  vast: "H100 SXM",  life: 4, replacementCost: 27_000 },
  "H100 NVL":                { orn: "H100 SXM",  vast: "H100 NVL",  life: 4, replacementCost: 26_000 },
  "H200":                    { orn: "H200",      vast: "H200",      life: 4, replacementCost: 33_000 },
  "H200 NVL":                { orn: "H200",      vast: "H200 NVL",  life: 4, replacementCost: 32_000 },
  "B200":                    { orn: "B200",      vast: "B200",      life: 5, replacementCost: 50_000 },
  // B300 (Blackwell Ultra): ORN doesn't list it yet, but Vast.ai now has native
  // B300 listings (~$8/hr per GPU). Native Vast beats the ORN B200-proxy via the
  // native-over-proxy precedence in effectiveRate(). ornProxy kept as last resort.
  "B300":                    { orn: null, ornProxy: "B200", vast: "B300", vastProxy: "B200", life: 5, replacementCost: 65_000 },
  "B300 DGX":                { orn: null, ornProxy: "B200", vast: "B300", vastProxy: "B200", life: 5, replacementCost: 70_000 },
  // RTX PRO 6000 Blackwell — ORN doesn't cover workstation cards; Vast.ai does
  // ("RTX PRO 6000 WS", the most populous Blackwell-gen workstation listing).
  "RTX PRO 6000":            { orn: null, vast: "RTX PRO 6000 WS", life: 4, replacementCost: 10_000 },
  "RTX PRO 6000 Blackwell":  { orn: null, vast: "RTX PRO 6000 WS", life: 4, replacementCost: 10_000 },
  "RTX 5090":                { orn: "RTX 5090",  vast: "RTX 5090",  life: 4, replacementCost: 2_500 },
  "RTX 4090":                { orn: null,        vast: "RTX 4090",  life: 4, replacementCost: 1_800 },
  "A100":                    { orn: "A100 SXM4", vast: "A100 SXM4", life: 4, replacementCost: 12_000 },
  "A100 PCIe":               { orn: "A100 SXM4", vast: "A100 PCIE", life: 4, replacementCost: 11_000 },
  "L40S":                    { orn: null,        vast: "L40S",      life: 4, replacementCost: 7_000 },
  "L40":                     { orn: null,        vast: "L40",       life: 4, replacementCost: 5_000 },
};

// Distinct ORN gpu names for a set of hardware entries (incl. proxies).
export function distinctOrnNames(hardwareEntries) {
  const out = new Set();
  for (const h of hardwareEntries) {
    const m = lookupGpu(typeof h === "string" ? h : h?.name);
    if (m?.orn) out.add(m.orn);
    if (m?.ornProxy) out.add(m.ornProxy);
  }
  return [...out];
}

// Normalize USDai hardware names. Examples:
//   "B200 [96] (Escrowed)"  → "B200"
//   "RTX PRO 6000 Blackwell" → "RTX PRO 6000 Blackwell"
//   "NVIDIA B300 [72]" → "B300"
export function normalizeHardwareName(raw) {
  if (!raw || typeof raw !== "string") return null;
  return raw
    .replace(/\s*\[\d+\]\s*/g, "")    // strip "[N]" count
    .replace(/\s*\(.*?\)\s*/g, "")    // strip "(...)" status chips
    .replace(/^NVIDIA\s+/i, "")       // strip "NVIDIA " prefix
    .trim();
}

// Look up a mapping by normalized name. Falls back to longest-prefix match
// so "RTX PRO 6000 Blackwell" matches "RTX PRO 6000" entry if the specific
// variant isn't in the table.
export function lookupGpu(rawName) {
  const norm = normalizeHardwareName(rawName);
  if (!norm) return null;
  if (USDAI_GPU_MAP[norm]) return { key: norm, ...USDAI_GPU_MAP[norm] };
  // longest-prefix fallback
  const keys = Object.keys(USDAI_GPU_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (norm.startsWith(k)) return { key: k, ...USDAI_GPU_MAP[k], matched: "prefix" };
  }
  return null;
}

// Distinct Vast.ai gpu_name values to query for a given set of hardware entries.
// Accepts either an array of objects with .name, or an array of plain strings.
export function distinctVastNames(hardwareEntries) {
  const out = new Set();
  for (const h of hardwareEntries) {
    const m = lookupGpu(typeof h === "string" ? h : h?.name);
    if (m?.vast) out.add(m.vast);
  }
  return [...out];
}
