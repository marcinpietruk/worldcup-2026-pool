// Team reference data and name normalization.
//
// The canonical fixture source (openfootball) and the live source (API-Football)
// spell some country names differently ("South Korea" vs "Korea Republic",
// "Ivory Coast" vs "Côte d'Ivoire"). We normalize both sides to a key so the
// live sync can line its fixtures up with the seeded matches.

// Canonical name -> ISO 3166-1 alpha-2 (used to derive a flag emoji).
// Scotland and England have no alpha-2 country code, so we hardcode their flags.
const ALPHA2: Record<string, string> = {
  Mexico: "MX",
  "South Africa": "ZA",
  "South Korea": "KR",
  "Czech Republic": "CZ",
  Canada: "CA",
  "Bosnia & Herzegovina": "BA",
  Qatar: "QA",
  Switzerland: "CH",
  Brazil: "BR",
  Morocco: "MA",
  Haiti: "HT",
  USA: "US",
  Paraguay: "PY",
  Australia: "AU",
  Turkey: "TR",
  Germany: "DE",
  "Curaçao": "CW",
  "Ivory Coast": "CI",
  Ecuador: "EC",
  Netherlands: "NL",
  Japan: "JP",
  Sweden: "SE",
  Tunisia: "TN",
  Belgium: "BE",
  Egypt: "EG",
  Iran: "IR",
  "New Zealand": "NZ",
  Spain: "ES",
  "Cape Verde": "CV",
  "Saudi Arabia": "SA",
  Uruguay: "UY",
  France: "FR",
  Senegal: "SN",
  Iraq: "IQ",
  Norway: "NO",
  Argentina: "AR",
  Algeria: "DZ",
  Austria: "AT",
  Jordan: "JO",
  Portugal: "PT",
  "DR Congo": "CD",
  Uzbekistan: "UZ",
  Colombia: "CO",
  Croatia: "HR",
  Ghana: "GH",
  Panama: "PA",
};

const SPECIAL_FLAGS: Record<string, string> = {
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
};

// FIFA 3-letter codes for display in tight spaces (best effort).
const FIFA_CODE: Record<string, string> = {
  Mexico: "MEX",
  "South Africa": "RSA",
  "South Korea": "KOR",
  "Czech Republic": "CZE",
  Canada: "CAN",
  "Bosnia & Herzegovina": "BIH",
  Qatar: "QAT",
  Switzerland: "SUI",
  Brazil: "BRA",
  Morocco: "MAR",
  Haiti: "HAI",
  Scotland: "SCO",
  USA: "USA",
  Paraguay: "PAR",
  Australia: "AUS",
  Turkey: "TUR",
  Germany: "GER",
  "Curaçao": "CUW",
  "Ivory Coast": "CIV",
  Ecuador: "ECU",
  Netherlands: "NED",
  Japan: "JPN",
  Sweden: "SWE",
  Tunisia: "TUN",
  Belgium: "BEL",
  Egypt: "EGY",
  Iran: "IRN",
  "New Zealand": "NZL",
  Spain: "ESP",
  "Cape Verde": "CPV",
  "Saudi Arabia": "KSA",
  Uruguay: "URU",
  France: "FRA",
  Senegal: "SEN",
  Iraq: "IRQ",
  Norway: "NOR",
  Argentina: "ARG",
  Algeria: "ALG",
  Austria: "AUT",
  Jordan: "JOR",
  Portugal: "POR",
  "DR Congo": "COD",
  Uzbekistan: "UZB",
  Colombia: "COL",
  England: "ENG",
  Croatia: "CRO",
  Ghana: "GHA",
  Panama: "PAN",
};

// Strip accents, lowercase, collapse punctuation/whitespace.
export function normalizeTeamName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Aliases the live API (or anyone) might use -> our canonical name.
// Keys are written naturally; we look them up by normalized form.
const ALIAS_SOURCE: Record<string, string> = {
  "Korea Republic": "South Korea",
  "Republic of Korea": "South Korea",
  Korea: "South Korea",
  "Cote d'Ivoire": "Ivory Coast",
  "Côte d'Ivoire": "Ivory Coast",
  Czechia: "Czech Republic",
  "Czech Rep.": "Czech Republic",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Bosnia-Herzegovina": "Bosnia & Herzegovina", // football-data.org spelling
  Bosnia: "Bosnia & Herzegovina",
  "Congo DR": "DR Congo",
  "Democratic Republic of Congo": "DR Congo",
  "United States": "USA",
  "United States of America": "USA",
  "Cabo Verde": "Cape Verde",
  "Cape Verde Islands": "Cape Verde", // football-data.org spelling
  "Türkiye": "Turkey",
  Turkiye: "Turkey",
  Curacao: "Curaçao",
};

const ALIASES_NORM: Record<string, string> = Object.fromEntries(
  Object.entries(ALIAS_SOURCE).map(([k, v]) => [normalizeTeamName(k), v]),
);

// Canonical names indexed by their normalized form, for direct matches.
const CANONICAL_BY_NORM: Record<string, string> = Object.fromEntries(
  [...Object.keys(ALPHA2), ...Object.keys(SPECIAL_FLAGS)].map((n) => [normalizeTeamName(n), n]),
);

// Resolve any spelling to our canonical team name (or return the input trimmed).
export function canonicalTeamName(raw: string): string {
  const trimmed = raw.trim();
  if (ALPHA2[trimmed] || SPECIAL_FLAGS[trimmed]) return trimmed;
  const norm = normalizeTeamName(trimmed);
  return ALIASES_NORM[norm] ?? CANONICAL_BY_NORM[norm] ?? trimmed;
}

export function flagFor(name: string): string {
  if (SPECIAL_FLAGS[name]) return SPECIAL_FLAGS[name];
  const code = ALPHA2[name];
  if (!code) return "🏳️";
  // Regional indicator symbols: 'A' (0x41) -> 0x1F1E6.
  return String.fromCodePoint(
    ...code.split("").map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)),
  );
}

export function fifaCodeFor(name: string): string {
  return FIFA_CODE[name] ?? name.slice(0, 3).toUpperCase();
}
