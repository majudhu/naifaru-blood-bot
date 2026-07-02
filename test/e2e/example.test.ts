import { describe, expect, it } from "vitest";
import { $fetch, setup } from "@nuxt/test-utils/e2e";

const nuxtConfig = {
  nitro: {
    preset: "node-server",
  },
  runtimeConfig: {
    session: {
      password: "test-password-with-at-least-32-characters",
    },
  },
} as NonNullable<Parameters<typeof setup>[0]>["nuxtConfig"];

describe("login page", async () => {
  await setup({
    nuxtConfig,
  });

  it("renders the login form", async () => {
    const html = await $fetch("/login");
    expect(html).toContain("Username");
    expect(html).toContain("Password");
    expect(html).toContain("Login");
  });
});
