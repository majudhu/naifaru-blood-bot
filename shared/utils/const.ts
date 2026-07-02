export const bloodTypeValues = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
export const requestStatusValues = ["open", "fulfilled", "cancelled"] as const;
export const donorResponseStatusValues = ["contacted", "accepted", "declined", "donated"] as const;
export const staffRoleValues = ["admin", "nurse"] as const;

export const EPOCH_STRING = "1970-01-01T00:00:00.000Z";
export const DAY_MS = 1000 * 60 * 60 * 24;
