export const auditActionLabels = {
  login: "Signed in",
  login_failed: "Sign-in failed",
  logout: "Signed out",
  create: "Created",
  update: "Updated",
  delete: "Deleted",
} as const;

export const auditEntityLabels = {
  user: "User",
  request: "Blood request",
  donation: "Donation",
  staff: "Staff account",
} as const;

export type AuditAction = keyof typeof auditActionLabels;
export type AuditEntity = keyof typeof auditEntityLabels;
