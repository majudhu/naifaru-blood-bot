export const bloodTypeValues = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
export const requestStatusValues = ["open", "fulfilled", "cancelled"] as const;
export const donorResponseStatusValues = ["contacted", "accepted", "declined", "donated"] as const;
export const staffRoleValues = ["admin", "nurse"] as const;

// HTML date inputs reject year zero, so normalize this sentinel before binding it to an input.
export const DATE_NIL = "0000-01-01T00:00:00Z";
export const DAY_MS = 1000 * 60 * 60 * 24;
