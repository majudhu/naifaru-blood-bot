import { recordAuditLog } from "../utils/audit";

export default defineNitroPlugin(() => {
  sessionHooks.hook("clear", async (session, event) => {
    if (!session.user) return;

    await recordAuditLog(useDb(event), event, session.user, {
      action: "logout",
      entityType: "staff",
      entityId: session.user.id,
    });
  });
});
