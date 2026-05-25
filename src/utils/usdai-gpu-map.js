// USDai hardware-label → market metadata.
// Update replacementCost quarterly from NVIDIA list / OEM channel pricing.
// `vast` = Vast.ai `gpu_name` enum value; null means no rental data available.
// `life` = default useful life in years for this model (slider overrideable).

export const USDAI_GPU_MAP = {
  "H100":                    { vast: "H100_SXM",  life: 4, replacementCost: 27_000 },
  "H100 SXM":                { vast: "H100_SXM",  life: 4, replacementCost: 27_000 },
  "H100 PCIe":               { vast: "H100_PCIE", life: 4, replacementCost: 25_000 },
  "H200":                    { vast: "H200",      life: 4, replacementCost: 33_000 },
  "B200":                    { vast: "B200",      life: 5, replacementCost: 50_000 },
  "B300":                    { vast: null,        life: 5, replacementCost: 65_000, note: "no rental data" },
  "RTX PRO 6000":            { vast: null,        life: 4, replacementCost: 10_000, note: "no rental data" },
  "RTX PRO 6000 Blackwell":  { vast: null,        life: 4, replacementCost: 10_000, note: "no rental data" },
  "RTX 5090":                { vast: "RTX_5090",  life: 4, replacementCost: 2_500 },
  "RTX 4090":                { vast: "RTX_4090",  life: 4, replacementCost: 1_800 },
  "A100":                    { vast: "A100_SXM4", life: 4, replacementCost: 12_000 },
  "A100 PCIe":               { vast: "A100_PCIE", life: 4, replacementCost: 11_000 },
  "L40S":                    { vast: "L40S",      life: 4, replacementCost: 7_000 },
};

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
