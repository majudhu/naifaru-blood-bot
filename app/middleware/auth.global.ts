export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return;

  const { loggedIn, ready } = useUserSession();

  if (ready.value && !loggedIn.value) return navigateTo("/login");
});
