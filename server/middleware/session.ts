export default defineEventHandler(async (event) => {
  if (
    !event.path.startsWith("/api/") &&
    !getRequestHeader(event, "accept")?.includes("text/html")
  ) {
    return;
  }

  if (!getCookie(event, useRuntimeConfig(event).session.name)) return;

  const { id: _id, ...session } = await getUserSession(event);
  if (!session.user) return;

  // Replacing resets the session's creation time; updating keeps its original expiry.
  await replaceUserSession(event, session);
});
