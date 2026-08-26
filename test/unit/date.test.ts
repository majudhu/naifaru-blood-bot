import { describe, expect, it } from "vitest";

import { DATE_NIL } from "../../shared/utils/const";
import { dateInputValue, formatAge, isDateNil } from "../../shared/utils/date";

describe("nil date display", () => {
  it("renders DATE_NIL as a blank input and dash age", () => {
    expect(new Date(DATE_NIL).toISOString()).toBe("0000-01-01T00:00:00.000Z");
    expect(isDateNil(DATE_NIL)).toBe(true);
    expect(dateInputValue(DATE_NIL)).toBe("");
    expect(formatAge(DATE_NIL)).toBe("-");
  });

  it("renders entered dates and their calculated ages", () => {
    expect(dateInputValue("2000-08-27T00:00:00.000Z")).toBe("2000-08-27");
    expect(formatAge("2000-08-27", Date.parse("2026-08-26T00:00:00.000Z"))).toBe("25 years");
  });
});
