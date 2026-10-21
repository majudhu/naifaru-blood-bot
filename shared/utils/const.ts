export const userStatusValues = ["Donor", "Temporary", "Reserved", "Non-Donor", "pending"] as const;
export const donorStatusValues = ["Donor", "Temporary", "Reserved"] as const;
export const userStatusLabels = {
  Donor: "Donor",
  Temporary: "Temporary",
  Reserved: "Reserved",
  "Non-Donor": "Non-Donor",
  pending: "Pending Review",
} as const;
export const bloodTypeValues = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
export const requestStatusValues = ["open", "fulfilled", "cancelled"] as const;
export const donorResponseStatusValues = ["contacted", "accepted", "declined", "donated"] as const;
export const staffRoleValues = ["admin", "nurse", "lab"] as const;

// HTML date inputs reject year zero, so normalize this sentinel before binding it to an input.
export const DATE_NIL = "0000-01-01T00:00:00Z";
export const DAY_MS = 1000 * 60 * 60 * 24;

export const PER_PAGE = 20;

export const SUMMARY_PERIODS = [
  { months: 0, days: 0, label: "Total", key: "total" },
  { months: 1, days: 30, label: "Month", key: "last30Days" },
  { months: 3, days: 90, label: "3 Month", key: "last90Days" },
  { months: 6, days: 180, label: "6 Month", key: "last180Days" },
  { months: 12, days: 365, label: "Year", key: "last365Days" },
] as const;
