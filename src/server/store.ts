import { normalize } from "../lib/engine";
import type { Observation } from "../lib/types";
// Byte budget includes a conservative overhead allowance, not just wire payload size.
export class ObservationStore {
  private entries = new Map<string, { value: Observation; size: number }>();
  private bytes = 0;
  private noiseKeys = new Map<string, true>();
  revision = 0;
  evictions = 0;
  constructor(readonly maxBytes = 128 * 1024 * 1024) {}
  put(value: Observation) {
    const old = this.entries.get(value.id);
    if (old?.value.origin === "live" && value.origin === "history") return;
    if (old) {
      this.bytes -= old.size;
      this.entries.delete(value.id);
      this.noiseKeys.delete(value.id);
    }
    const size = Buffer.byteLength(JSON.stringify(value)) * 2 + 256;
    if (size > this.maxBytes) return;
    this.entries.set(value.id, { value, size });
    if (normalize(value, {}).suppressed) this.noiseKeys.set(value.id, true);
    this.bytes += size;
    this.revision++;
    while (this.bytes > this.maxBytes) {
      const first =
        this.noiseKeys.keys().next().value ?? this.entries.keys().next().value!;
      this.noiseKeys.delete(first);
      this.bytes -= this.entries.get(first)!.size;
      this.entries.delete(first);
      this.evictions++;
    }
  }
  query(start: string, end: string) {
    const found: Observation[] = [];
    for (const [id, entry] of this.entries) {
      if (entry.value.timestamp >= start && entry.value.timestamp <= end)
        found.push(entry.value);
    }
    for (const o of found) {
      const entry = this.entries.get(o.id)!;
      this.entries.delete(o.id);
      this.entries.set(o.id, entry);
    }
    return found;
  }
  get(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    this.entries.set(id, e);
    return e.value;
  }
  clear() {
    this.entries.clear();
    this.noiseKeys.clear();
    this.bytes = 0;
    this.revision++;
    this.evictions = 0;
  }
  get size() {
    return this.entries.size;
  }
  get byteSize() {
    return this.bytes;
  }
}
