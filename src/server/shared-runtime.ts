import { HomeRuntime } from "./runtime-core";
// Change this only when constructor state changes incompatibly. Ordinary hot
// reloads refresh methods while preserving the established HA connection.
const runtimeVersion = 3;
type RuntimeHost = {
  __homeTimelineRuntime?: HomeRuntime;
  __homeTimelineRuntimeVersion?: number;
};
export function sharedRuntime(host: RuntimeHost): HomeRuntime {
  if (host.__homeTimelineRuntimeVersion !== runtimeVersion) {
    host.__homeTimelineRuntime?.disconnect();
    host.__homeTimelineRuntime = new HomeRuntime();
    host.__homeTimelineRuntimeVersion = runtimeVersion;
  }
  const runtime = (host.__homeTimelineRuntime ??= new HomeRuntime());
  // Next development reloads module constructors, but globalThis survives.
  // Without this, old snapshot/filter code survives indefinitely in memory.
  if (Object.getPrototypeOf(runtime) !== HomeRuntime.prototype) {
    Object.setPrototypeOf(runtime, HomeRuntime.prototype);
  }
  runtime.initialize();
  return runtime;
}
