import type { Staff } from "#server/schema";

declare module "#auth-utils" {
  interface User {
    id: number;
    name: string;
    role: Staff["role"];
  }
}
