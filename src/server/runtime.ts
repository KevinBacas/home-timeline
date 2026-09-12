import "server-only";
import { sharedRuntime } from "./shared-runtime";
export function getRuntime() {
  return sharedRuntime(globalThis as Parameters<typeof sharedRuntime>[0]);
}
