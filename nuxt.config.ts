// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  nitro: {
    preset: "cloudflare_module",

    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },

  modules: [
    "nitro-cloudflare-dev",
    "@nuxt/ui",
    "@nuxt/icon",
    "@nuxt/test-utils",
    "nuxt-auth-utils",
  ],

  css: ["~/assets/css/main.css"],

  ui: { colorMode: false },

  icon: {
    mode: "css",
    cssLayer: "base",
  },

  runtimeConfig: {
    session: {
      maxAge: 60 * 60 * 24 * 7, // 1 week
      password: process.env.NUXT_SESSION_PASSWORD || "",
    },
  },
});
