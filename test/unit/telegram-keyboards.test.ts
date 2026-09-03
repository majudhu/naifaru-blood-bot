import { describe, expect, it } from "vitest";

import { mainMenuKeyboard } from "../../server/utils/telegram/keyboards";

describe("Telegram keyboards", () => {
  it("lets users dismiss the main menu with the system back button", () => {
    const keyboard = mainMenuKeyboard();

    expect(keyboard.is_persistent).toBeUndefined();
    expect(keyboard.resize_keyboard).toBe(true);
  });
});
