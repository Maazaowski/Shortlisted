import { COUNTRIES } from "../preferences.js";

/**
 * Turns the free text of a job location ("Remote - EMEA", "Dubai, UAE",
 * "Austin, TX") into country codes and region ids. Rules and lookup tables
 * only. When a place is not recognised it is left out, never guessed.
 */

export const WORLD = "WORLD";

const EU = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ");
const EUROPE = [...EU, ..."GB CH NO IS LI UA RS BA ME MK AL MD BY AD MC SM TR".split(" ")];
const GCC = "AE SA QA BH KW OM".split(" ");
const MIDDLE_EAST = [...GCC, ..."JO LB IL IQ IR YE SY PS EG TR".split(" ")];
const AFRICA = "DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW".split(" ");
const SOUTH_ASIA = "PK IN BD LK NP BT MV AF".split(" ");
const SOUTHEAST_ASIA = "SG MY ID TH VN PH KH LA MM BN TL".split(" ");
const EAST_ASIA = "CN JP KR TW HK MO MN".split(" ");
const CENTRAL_ASIA = "KZ UZ KG TJ TM".split(" ");
const ASIA = [...SOUTH_ASIA, ...SOUTHEAST_ASIA, ...EAST_ASIA, ...CENTRAL_ASIA];
const ANZ = ["AU", "NZ"];
const NORTH_AMERICA = ["US", "CA", "MX"];
const LATAM = "MX BR AR CL CO PE UY PY BO EC VE CR PA GT HN SV NI DO CU PR".split(" ");

const unique = (codes: string[]) => [...new Set(codes)];

/** Region id to the countries it covers. Pakistan is in ASIA, APAC and SOUTH_ASIA, and deliberately not in EMEA or MENA. */
export const REGIONS: Record<string, string[]> = {
  EU,
  EUROPE: unique(EUROPE),
  EMEA: unique([...EUROPE, ...MIDDLE_EAST, ...AFRICA]),
  GCC,
  MIDDLE_EAST: unique(MIDDLE_EAST),
  MENA: unique([...MIDDLE_EAST, "DZ", "MA", "TN", "LY"]),
  AFRICA,
  SOUTH_ASIA,
  SOUTHEAST_ASIA,
  ASIA,
  ANZ,
  APAC: unique([...ASIA, ...ANZ, "FJ", "PG"]),
  NORTH_AMERICA,
  LATAM,
  AMERICAS: unique([...NORTH_AMERICA, ...LATAM]),
  DACH: ["DE", "AT", "CH"],
  NORDICS: ["SE", "NO", "DK", "FI", "IS"],
  BENELUX: ["BE", "NL", "LU"],
};

/** Longer and more specific phrases first, so "asia pacific" is not read as "asia". */
const REGION_PATTERNS: [RegExp, string][] = [
  [/\b(apac|asia[- ]pacific|apj)\b/i, "APAC"],
  [/\bemea\b/i, "EMEA"],
  [/\bmena\b/i, "MENA"],
  [/\b(gcc|gulf (region|countries|states))\b/i, "GCC"],
  [/\bmiddle east\b/i, "MIDDLE_EAST"],
  [/\b(european union|eea|e\.u\.)\b/i, "EU"],
  [/\bEU\b/, "EU"],
  [/\beurope(an)?\b/i, "EUROPE"],
  [/\b(latam|latin america|south america)\b/i, "LATAM"],
  [/\b(north america|noram|namer)\b/i, "NORTH_AMERICA"],
  [/\b(americas|amer)\b/i, "AMERICAS"],
  [/\bsouth[- ]?east asia\b/i, "SOUTHEAST_ASIA"],
  [/\bsouth asia\b/i, "SOUTH_ASIA"],
  [/\basia\b/i, "ASIA"],
  [/\bafrica\b/i, "AFRICA"],
  [/\bdach\b/i, "DACH"],
  [/\b(nordics?|scandinavia)\b/i, "NORDICS"],
  [/\bbenelux\b/i, "BENELUX"],
  [/\b(anz|australia and new zealand|oceania)\b/i, "ANZ"],
];

const WORLD_PATTERN = /\b(worldwide|world[- ]wide|anywhere|globally|global|international|any (country|location)|all countries)\b/i;

/** Country names that are also common words, first names or US states. Too risky to read from free text. */
const AMBIGUOUS_NAMES = new Set(["GE", "JE", "TD", "GN", "IM"]);

const ALIASES: Record<string, string> = {
  "united states of america": "US",
  "united states": "US",
  usa: "US",
  "u.s.a.": "US",
  "u.s.": "US",
  america: "US",
  "united kingdom": "GB",
  "u.k.": "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  "united arab emirates": "AE",
  uae: "AE",
  "u.a.e.": "AE",
  emirates: "AE",
  "saudi arabia": "SA",
  saudi: "SA",
  ksa: "SA",
  turkey: "TR",
  türkiye: "TR",
  "czech republic": "CZ",
  czechia: "CZ",
  "south korea": "KR",
  korea: "KR",
  russia: "RU",
  vietnam: "VN",
  "the netherlands": "NL",
  holland: "NL",
  "hong kong": "HK",
  macau: "MO",
  palestine: "PS",
  bosnia: "BA",
  "ivory coast": "CI",
  uk: "GB",
};

/** Cities that show up alone in job locations often enough to be worth knowing. */
const CITIES: Record<string, string> = {
  dubai: "AE",
  "abu dhabi": "AE",
  sharjah: "AE",
  riyadh: "SA",
  jeddah: "SA",
  dammam: "SA",
  khobar: "SA",
  neom: "SA",
  doha: "QA",
  manama: "BH",
  "kuwait city": "KW",
  muscat: "OM",
  karachi: "PK",
  lahore: "PK",
  islamabad: "PK",
  london: "GB",
  manchester: "GB",
  edinburgh: "GB",
  berlin: "DE",
  munich: "DE",
  hamburg: "DE",
  frankfurt: "DE",
  amsterdam: "NL",
  rotterdam: "NL",
  dublin: "IE",
  paris: "FR",
  madrid: "ES",
  barcelona: "ES",
  lisbon: "PT",
  porto: "PT",
  warsaw: "PL",
  krakow: "PL",
  stockholm: "SE",
  copenhagen: "DK",
  oslo: "NO",
  helsinki: "FI",
  zurich: "CH",
  geneva: "CH",
  vienna: "AT",
  prague: "CZ",
  budapest: "HU",
  bucharest: "RO",
  sofia: "BG",
  tallinn: "EE",
  vilnius: "LT",
  riga: "LV",
  brussels: "BE",
  milan: "IT",
  rome: "IT",
  athens: "GR",
  istanbul: "TR",
  "tel aviv": "IL",
  cairo: "EG",
  amman: "JO",
  lagos: "NG",
  nairobi: "KE",
  "cape town": "ZA",
  johannesburg: "ZA",
  toronto: "CA",
  vancouver: "CA",
  montreal: "CA",
  ottawa: "CA",
  "new york": "US",
  nyc: "US",
  "san francisco": "US",
  "bay area": "US",
  seattle: "US",
  austin: "US",
  boston: "US",
  chicago: "US",
  "los angeles": "US",
  denver: "US",
  atlanta: "US",
  miami: "US",
  "washington, d.c.": "US",
  "mexico city": "MX",
  "são paulo": "BR",
  "sao paulo": "BR",
  "buenos aires": "AR",
  bogotá: "CO",
  bogota: "CO",
  sydney: "AU",
  melbourne: "AU",
  auckland: "NZ",
  tokyo: "JP",
  seoul: "KR",
  taipei: "TW",
  beijing: "CN",
  shanghai: "CN",
  shenzhen: "CN",
  bangalore: "IN",
  bengaluru: "IN",
  hyderabad: "IN",
  mumbai: "IN",
  pune: "IN",
  gurgaon: "IN",
  gurugram: "IN",
  noida: "IN",
  chennai: "IN",
  "new delhi": "IN",
  delhi: "IN",
  dhaka: "BD",
  colombo: "LK",
  "kuala lumpur": "MY",
  jakarta: "ID",
  bangkok: "TH",
  manila: "PH",
  "ho chi minh": "VN",
  hanoi: "VN",
};

const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC";
const US_STATE_PATTERN = new RegExp(`,\\s*(${US_STATES.split(" ").join("|")})\\b`);

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One lookup of every name we know, longest first, so "south korea" wins over "korea". */
const NAME_TO_CODE: [RegExp, string][] = (() => {
  const names = new Map<string, string>();
  for (const c of COUNTRIES) if (!AMBIGUOUS_NAMES.has(c.code)) names.set(c.name.toLowerCase(), c.code);
  for (const [name, code] of Object.entries(ALIASES)) names.set(name, code);
  for (const [name, code] of Object.entries(CITIES)) names.set(name, code);
  return [...names.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([name, code]) => [new RegExp(`(^|[^\\p{L}])${escape(name)}(?=$|[^\\p{L}])`, "iu"), code] as [RegExp, string]);
})();

export type Places = { world: boolean; regions: string[]; countries: string[] };

/** Every region and country named in a piece of text. */
export function findPlaces(text: string): Places {
  let rest = text;
  const regions = new Set<string>();
  const countries = new Set<string>();
  const take = (re: RegExp): boolean => {
    const m = re.exec(rest);
    if (!m) return false;
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
    return true;
  };

  for (const [re, id] of REGION_PATTERNS) while (take(re)) regions.add(id);
  // "US" and "UK" only in capitals: the lowercase words are too common.
  while (take(/\bUSA?\b/)) countries.add("US");
  while (take(/\bUK\b/)) countries.add("GB");
  for (const [re, code] of NAME_TO_CODE) while (take(re)) countries.add(code);
  if (countries.size === 0 && US_STATE_PATTERN.test(rest)) countries.add("US");
  const world = WORLD_PATTERN.test(rest);
  return { world, regions: [...regions], countries: [...countries] };
}

/** Does a list of country codes and region ids cover this country? */
export function covers(placeIds: string[], country: string): boolean {
  for (const id of placeIds) {
    if (id === WORLD || id === country) return true;
    if (REGIONS[id]?.includes(country)) return true;
  }
  return false;
}
