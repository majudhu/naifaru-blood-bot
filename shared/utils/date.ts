import { DATE_NIL } from "./const";

export function isDateNil(value: string) {
  return value.substring(0, 10) === DATE_NIL.substring(0, 10);
}

export function dateInputValue(value: string) {
  return isDateNil(value) ? "" : value.substring(0, 10);
}

export function formatAge(value: string, now = Date.now()) {
  if (!value || isDateNil(value)) return "-";

  const birthDate = new Date(value);
  const currentDate = new Date(now);
  let age = currentDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasPassed =
    currentDate.getUTCMonth() > birthDate.getUTCMonth() ||
    (currentDate.getUTCMonth() === birthDate.getUTCMonth() &&
      currentDate.getUTCDate() >= birthDate.getUTCDate());

  if (!birthdayHasPassed) age -= 1;
  return `${age} years`;
}
