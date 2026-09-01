export const STUB_GROUPS = [
  {
    title: "Earnings",
    fields: [
      { key: "zakladna", label: "Základná mzda", kind: "money" },
      { key: "dovolenka_days", label: "Dovolenka (days)", kind: "qty" },
      { key: "dovolenka", label: "Dovolenka", kind: "money" },
      { key: "osobne", label: "Osobné ohodnotenie", kind: "money" },
      { key: "sviatky_days", label: "Sviatky (days)", kind: "qty" },
      { key: "sviatky", label: "Sviatky", kind: "money" },
      { key: "premie", label: "Prémie", kind: "money" },
      { key: "noc_hours", label: "Práca v noci (h)", kind: "qty" },
      { key: "noc", label: "Práca v noci", kind: "money" },
      { key: "sobota_hours", label: "Práca v sobotu (h)", kind: "qty" },
      { key: "sobota", label: "Práca v sobotu", kind: "money" },
      { key: "nedela_hours", label: "Práca v nedeľu (h)", kind: "qty" },
      { key: "nedela", label: "Práca v nedeľu", kind: "money" },
      { key: "platene_volno_days", label: "Platené voľno (days)", kind: "qty" },
      { key: "platene_volno", label: "Platené voľno", kind: "money" },
      { key: "premie_dlhsie", label: "Prémie za dlhšie obdobie", kind: "money" },
      { key: "hruba", label: "Hrubá mzda", kind: "money" },
    ],
  },
  {
    title: "Deductions / net",
    fields: [
      { key: "np", label: "Nemocenské (NP)", kind: "money" },
      { key: "sp", label: "Starobné (SP)", kind: "money" },
      { key: "ip", label: "Invalidné (IP)", kind: "money" },
      { key: "pvn", label: "Poist. v nezam. (PvN)", kind: "money" },
      { key: "zp", label: "Zdravotné (ZP)", kind: "money" },
      { key: "nczd", label: "Nezdaniteľná časť", kind: "money" },
      { key: "dan", label: "Daň", kind: "money" },
      { key: "danovy_bonus", label: "Daňový bonus - deti", kind: "money" },
      { key: "cista", label: "Čistá mzda", kind: "money", receivedLike: true },
      { key: "nahrada_prijmu", label: "Náhrada príjmu", kind: "money" },
      { key: "nezdane_nahrady", label: "Nezdaniteľné náhrady", kind: "money" },
      { key: "vyuctovanie", label: "Vyúčtovanie", kind: "money", receivedLike: true },
    ],
  },
  {
    title: "Employer",
    fields: [
      { key: "er_np", label: "NP (employer)", kind: "money" },
      { key: "er_sp", label: "SP (employer)", kind: "money" },
      { key: "er_ip", label: "IP (employer)", kind: "money" },
      { key: "er_pvn", label: "PvN (employer)", kind: "money" },
      { key: "er_pfp", label: "PFP (employer)", kind: "money" },
      { key: "er_up", label: "UP (employer)", kind: "money" },
      { key: "er_gp", label: "GP (employer)", kind: "money" },
      { key: "er_prfs", label: "PRFS (employer)", kind: "money" },
      { key: "er_zp", label: "ZP (employer)", kind: "money" },
      { key: "employer_cost", label: "Celková cena práce", kind: "money" },
    ],
  },
];

export const STUB_KEYS = STUB_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
const DETAIL_KEYS = STUB_GROUPS.flatMap((g) => g.fields.filter((f) => f.kind === "money" && !f.receivedLike).map((f) => f.key));

export const emptyStub = () => Object.fromEntries(STUB_KEYS.map((k) => [k, ""]));

export function stubFromMonth(month) {
  const src = month?.stub || {};
  const out = emptyStub();
  for (const key of STUB_KEYS) {
    if (src[key] != null && src[key] !== "") out[key] = src[key];
  }
  return out;
}

export function parseStub(stub) {
  const out = {};
  for (const key of STUB_KEYS) {
    const raw = stub?.[key];
    if (raw === "" || raw == null) continue;
    const n = Number(raw);
    if (!Number.isNaN(n)) out[key] = n;
  }
  return out;
}

export function fillStubFromCalc(stub, month) {
  const map = {
    zakladna: "basic",
    osobne: "osobne",
    sviatky: "holiday_prem",
    noc: "night_prem",
    noc_hours: "night_h",
    sobota: "sat_prem",
    sobota_hours: "sat_h",
    nedela: "sun_prem",
    nedela_hours: "sun_h",
    hruba: "hruba",
    np: "np",
    sp: "sp",
    ip: "ip",
    pvn: "pvn",
    zp: "zp",
    nczd: "nczd_applied",
    dan: "dan",
    cista: "cista",
    employer_cost: "employer_cost",
  };
  const out = { ...emptyStub(), ...stub };
  for (const [stubKey, calcKey] of Object.entries(map)) {
    const cur = stub?.[stubKey];
    if (cur !== "" && cur != null) continue;
    const v = month?.[calcKey];
    if (v == null || v === "") continue;
    out[stubKey] = v;
  }
  return out;
}

export function isStubIncomplete(received, stub) {
  if (received == null) return false;
  return !DETAIL_KEYS.some((key) => {
    const n = Number(stub?.[key]);
    return stub?.[key] !== "" && stub?.[key] != null && !Number.isNaN(n) && n !== 0;
  });
}

export const SETTINGS_GROUPS = [
  {
    title: "Identity",
    keys: ["name", "department", "employer", "personal_no", "health_insurer"],
  },
  {
    title: "Contract",
    keys: [
      "hourly_rate",
      "avg_earnings",
      "employment_type",
      "dohoda_type",
      "contract_h_week",
      "full_time_shift_hours",
      "unpaid_break_after",
      "unpaid_break_hours",
    ],
  },
  {
    title: "Tax",
    keys: ["apply_nczd", "nczd", "tax19", "tax25", "tax30", "tax35", "bracket19", "bracket25", "bracket30"],
  },
  {
    title: "Employee odvody",
    keys: ["apply_oop", "oop", "rate_np", "rate_sp", "rate_ip", "rate_pvn", "rate_zp"],
  },
  {
    title: "Employer odvody",
    keys: ["er_np", "er_sp", "er_ip", "er_pvn", "er_pfp", "er_up", "er_gp", "er_prfs", "er_zp"],
  },
  {
    title: "Príplatky",
    keys: ["prem_sat", "prem_sun", "prem_night", "prem_hol_pct", "prem_ot_pct", "min_wage_month", "min_wage_hour"],
  },
];

export const HIDDEN_SETTINGS = ["ot_enabled", "contract_hours_week"];

export function settingsGroups(draft) {
  const source = draft || {};
  return SETTINGS_GROUPS.map((group) => ({
    title: group.title,
    entries: group.keys.map((key) => [key, key in source ? source[key] : ""]),
  })).filter((group) => group.entries.length);
}
