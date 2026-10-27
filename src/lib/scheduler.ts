import type { ScheduledTask } from "./store";

type Spec = Pick<ScheduledTask, "kind" | "time" | "date" | "weekday">;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Next run time (ms) strictly after `from`, or null for a one-off that's in the past. */
export function computeNext(t: Spec, from = Date.now()): number | null {
  const [h = 0, m = 0] = t.time.split(":").map(Number);
  if (t.kind === "once") {
    if (!t.date) return null;
    const [y = 1970, mo = 1, d = 1] = t.date.split("-").map(Number);
    const at = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
    return at > from ? at : null;
  }
  const c = new Date(from);
  c.setHours(h, m, 0, 0);
  if (t.kind === "daily") {
    if (c.getTime() <= from) c.setDate(c.getDate() + 1);
    return c.getTime();
  }
  c.setDate(c.getDate() + (((t.weekday ?? 1) - c.getDay() + 7) % 7));
  if (c.getTime() <= from) c.setDate(c.getDate() + 7);
  return c.getTime();
}

export function describeSchedule(t: Spec): string {
  if (t.kind === "once") return `Once on ${t.date} at ${t.time}`;
  if (t.kind === "daily") return `Every day at ${t.time}`;
  return `Every ${DAYS[t.weekday ?? 1]} at ${t.time}`;
}
