/**
 * The 64 districts (zila) of Bangladesh, grouped by their 8 divisions.
 *
 * Names use the official English spellings adopted in 2018 (Barishal,
 * Chattogram, Cumilla, Jashore, Bogura). Older spellings are kept as search
 * aliases so "Chittagong" or "Comilla" still find the right district.
 */
import type { ComboboxItem, ComboboxItemGroup, ComboboxParsedItem, OptionsFilter } from "@mantine/core";

export const BD_DIVISIONS = [
  "Barishal",
  "Chattogram",
  "Dhaka",
  "Khulna",
  "Mymensingh",
  "Rajshahi",
  "Rangpur",
  "Sylhet",
] as const;

export type BangladeshDivision = (typeof BD_DIVISIONS)[number];

export interface BangladeshDistrict {
  name: string;
  division: BangladeshDivision;
  /** Former / alternative romanisations accepted by the district search. */
  aliases?: readonly string[];
}

export const BD_DISTRICTS: readonly BangladeshDistrict[] = [
  // Barishal Division (6)
  { name: "Barguna", division: "Barishal" },
  { name: "Barishal", division: "Barishal", aliases: ["Barisal"] },
  { name: "Bhola", division: "Barishal" },
  { name: "Jhalokati", division: "Barishal", aliases: ["Jhalokathi", "Jhalakathi"] },
  { name: "Patuakhali", division: "Barishal" },
  { name: "Pirojpur", division: "Barishal" },

  // Chattogram Division (11)
  { name: "Bandarban", division: "Chattogram" },
  { name: "Brahmanbaria", division: "Chattogram" },
  { name: "Chandpur", division: "Chattogram" },
  { name: "Chattogram", division: "Chattogram", aliases: ["Chittagong"] },
  { name: "Cox's Bazar", division: "Chattogram", aliases: ["Coxs Bazar", "Cox Bazar"] },
  { name: "Cumilla", division: "Chattogram", aliases: ["Comilla"] },
  { name: "Feni", division: "Chattogram" },
  { name: "Khagrachhari", division: "Chattogram", aliases: ["Khagrachari"] },
  { name: "Lakshmipur", division: "Chattogram", aliases: ["Laxmipur"] },
  { name: "Noakhali", division: "Chattogram" },
  { name: "Rangamati", division: "Chattogram" },

  // Dhaka Division (13)
  { name: "Dhaka", division: "Dhaka" },
  { name: "Faridpur", division: "Dhaka" },
  { name: "Gazipur", division: "Dhaka" },
  { name: "Gopalganj", division: "Dhaka" },
  { name: "Kishoreganj", division: "Dhaka" },
  { name: "Madaripur", division: "Dhaka" },
  { name: "Manikganj", division: "Dhaka" },
  { name: "Munshiganj", division: "Dhaka" },
  { name: "Narayanganj", division: "Dhaka" },
  { name: "Narsingdi", division: "Dhaka" },
  { name: "Rajbari", division: "Dhaka" },
  { name: "Shariatpur", division: "Dhaka" },
  { name: "Tangail", division: "Dhaka" },

  // Khulna Division (10)
  { name: "Bagerhat", division: "Khulna" },
  { name: "Chuadanga", division: "Khulna" },
  { name: "Jashore", division: "Khulna", aliases: ["Jessore"] },
  { name: "Jhenaidah", division: "Khulna", aliases: ["Jhenaida"] },
  { name: "Khulna", division: "Khulna" },
  { name: "Kushtia", division: "Khulna" },
  { name: "Magura", division: "Khulna" },
  { name: "Meherpur", division: "Khulna" },
  { name: "Narail", division: "Khulna" },
  { name: "Satkhira", division: "Khulna" },

  // Mymensingh Division (4)
  { name: "Jamalpur", division: "Mymensingh" },
  { name: "Mymensingh", division: "Mymensingh" },
  { name: "Netrokona", division: "Mymensingh", aliases: ["Netrakona"] },
  { name: "Sherpur", division: "Mymensingh" },

  // Rajshahi Division (8)
  { name: "Bogura", division: "Rajshahi", aliases: ["Bogra"] },
  { name: "Chapai Nawabganj", division: "Rajshahi", aliases: ["Chapainawabganj", "Nawabganj"] },
  { name: "Joypurhat", division: "Rajshahi", aliases: ["Jaipurhat"] },
  { name: "Naogaon", division: "Rajshahi" },
  { name: "Natore", division: "Rajshahi" },
  { name: "Pabna", division: "Rajshahi" },
  { name: "Rajshahi", division: "Rajshahi" },
  { name: "Sirajganj", division: "Rajshahi" },

  // Rangpur Division (8)
  { name: "Dinajpur", division: "Rangpur" },
  { name: "Gaibandha", division: "Rangpur" },
  { name: "Kurigram", division: "Rangpur" },
  { name: "Lalmonirhat", division: "Rangpur" },
  { name: "Nilphamari", division: "Rangpur" },
  { name: "Panchagarh", division: "Rangpur" },
  { name: "Rangpur", division: "Rangpur" },
  { name: "Thakurgaon", division: "Rangpur" },

  // Sylhet Division (4)
  { name: "Habiganj", division: "Sylhet" },
  { name: "Moulvibazar", division: "Sylhet", aliases: ["Maulvibazar"] },
  { name: "Sunamganj", division: "Sylhet" },
  { name: "Sylhet", division: "Sylhet" },
];

/** Every district name, alphabetical. */
export const BD_DISTRICT_NAMES: readonly string[] = BD_DISTRICTS.map((district) => district.name).sort((a, b) =>
  a.localeCompare(b)
);

const DISTRICT_NAME_SET = new Set(BD_DISTRICT_NAMES.map((name) => name.toLowerCase()));

/** True when `value` is one of the 64 district names (case-insensitive). */
export function isBangladeshDistrict(value: string | null | undefined): boolean {
  return typeof value === "string" && DISTRICT_NAME_SET.has(value.trim().toLowerCase());
}

/** Canonical spelling for a district name or alias, or `null` when unknown. */
export function resolveBangladeshDistrict(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const needle = value.trim().toLowerCase();
  if (needle === "") {
    return null;
  }
  const match = BD_DISTRICTS.find(
    (district) =>
      district.name.toLowerCase() === needle || (district.aliases ?? []).some((alias) => alias.toLowerCase() === needle)
  );
  return match ? match.name : null;
}

/** Mantine `Select` data: districts grouped by division (divisions and districts alphabetical). */
export const BD_DISTRICT_SELECT_DATA: ComboboxItemGroup<ComboboxItem>[] = BD_DIVISIONS.map((division) => ({
  group: `${division} Division`,
  items: BD_DISTRICTS.filter((district) => district.division === division)
    .map((district) => ({ value: district.name, label: district.name }))
    .sort((a, b) => a.label.localeCompare(b.label)),
}));

const SEARCH_TERMS = new Map<string, string[]>(
  BD_DISTRICTS.map((district) => [
    district.name,
    [district.name, ...(district.aliases ?? []), district.division].map((term) => term.toLowerCase()),
  ])
);

function matchesSearch(item: ComboboxItem, search: string): boolean {
  const terms = SEARCH_TERMS.get(item.value) ?? [item.label.toLowerCase()];
  return terms.some((term) => term.includes(search));
}

/** `Select` filter that also matches former spellings and the division name. */
export const bdDistrictFilter: OptionsFilter = ({ options, search }) => {
  const needle = search.trim().toLowerCase();
  if (needle === "") {
    return options;
  }
  const result: ComboboxParsedItem[] = [];
  for (const option of options) {
    if ("group" in option) {
      const items = option.items.filter((item) => matchesSearch(item, needle));
      if (items.length > 0) {
        result.push({ group: option.group, items });
      }
    } else if (matchesSearch(option, needle)) {
      result.push(option);
    }
  }
  return result;
};
