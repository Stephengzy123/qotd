import "server-only";

export type TimetablePeriod = { label: string; start: string; end: string; kind: "class" | "activity" | "lunch"; infoUrl?: string };
export type TimetableConfig = { monday: TimetablePeriod[]; tuesday: TimetablePeriod[]; wednesday: TimetablePeriod[]; thursday: TimetablePeriod[]; friday: TimetablePeriod[]; flex: TimetablePeriod[] };

export const DEFAULT_TIMETABLE: TimetableConfig = {
  monday: [
    { label: "Period 1", start: "08:30", end: "09:40", kind: "class" }, { label: "Period 2", start: "09:50", end: "11:00", kind: "class" },
    { label: "Connection Block", start: "11:05", end: "11:35", kind: "activity" }, { label: "Lunch", start: "11:35", end: "12:35", kind: "lunch" },
    { label: "Period 3", start: "12:45", end: "13:55", kind: "class" }, { label: "Period 4", start: "14:05", end: "15:15", kind: "class" },
  ],
  tuesday: [
    { label: "Period 1", start: "08:30", end: "09:40", kind: "class" }, { label: "Period 2", start: "09:50", end: "11:00", kind: "class" },
    { label: "Advisory", start: "11:05", end: "11:35", kind: "activity" }, { label: "Lunch", start: "11:35", end: "12:35", kind: "lunch" },
    { label: "Period 3", start: "12:45", end: "13:55", kind: "class" }, { label: "Period 4", start: "14:05", end: "15:15", kind: "class" },
  ],
  wednesday: [
    { label: "Period 1", start: "08:30", end: "09:30", kind: "class" }, { label: "Period 2", start: "09:40", end: "10:40", kind: "class" },
    { label: "X Block", start: "10:50", end: "11:50", kind: "activity" }, { label: "Lunch", start: "11:50", end: "12:55", kind: "lunch" },
    { label: "Period 3", start: "13:05", end: "14:05", kind: "class" }, { label: "Period 4", start: "14:15", end: "15:15", kind: "class" },
  ],
  thursday: [
    { label: "Period 1", start: "08:30", end: "09:40", kind: "class" }, { label: "Period 2", start: "09:50", end: "11:00", kind: "class" },
    { label: "Connection Block", start: "11:05", end: "11:35", kind: "activity" }, { label: "Lunch", start: "11:35", end: "12:35", kind: "lunch" },
    { label: "Period 3", start: "12:45", end: "13:55", kind: "class" }, { label: "Period 4", start: "14:05", end: "15:15", kind: "class" },
  ],
  friday: [
    { label: "Period 1", start: "08:30", end: "09:40", kind: "class" }, { label: "Period 2", start: "09:50", end: "11:00", kind: "class" },
    { label: "Assembly", start: "11:05", end: "11:35", kind: "activity" }, { label: "Lunch", start: "11:35", end: "12:35", kind: "lunch" },
    { label: "Period 3", start: "12:45", end: "13:55", kind: "class" }, { label: "Period 4", start: "14:05", end: "15:15", kind: "class" },
  ],
  flex: [{ label: "Flex Day", start: "08:30", end: "15:15", kind: "activity" }],
};

export function validateTimetable(input: unknown): TimetableConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter a complete timetable.");
  const result = {} as TimetableConfig;
  for (const key of Object.keys(DEFAULT_TIMETABLE) as (keyof TimetableConfig)[]) {
    const rows = (input as Record<string, unknown>)[key];
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 16) throw new Error(`${key}: use between 1 and 16 periods.`);
    let previousEnd = "";
    result[key] = rows.map((row, index) => {
      const prefix = `${key}, period ${index + 1}`;
      if (!row || typeof row !== "object") throw new Error(`${prefix}: invalid period.`);
      const { label, start, end, kind } = row;
      if (typeof label !== "string" || !label.trim() || label.trim().length > 80) throw new Error(`${prefix}: enter a label of 1–80 characters.`);
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (typeof start !== "string" || typeof end !== "string" || !time.test(start) || !time.test(end) || start >= end) throw new Error(`${prefix}: enter valid start and end times, with the end after the start.`);
      if (start < previousEnd) throw new Error(`${prefix}: periods must be in time order without overlapping.`);
      if (kind !== "class" && kind !== "activity" && kind !== "lunch") throw new Error(`${prefix}: choose a valid period type.`);
      let infoUrl: string | undefined;
      if (kind === "activity" && row.infoUrl) {
        if (typeof row.infoUrl !== "string" || row.infoUrl.length > 2048) throw new Error(`${prefix}: enter an information URL of at most 2,048 characters.`);
        try {
          const url = new URL(row.infoUrl.trim());
          if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
          infoUrl = url.href;
        } catch { throw new Error(`${prefix}: enter a full http:// or https:// information link.`); }
      }
      previousEnd = end;
      return { label: label.trim(), start, end, kind, ...(infoUrl ? { infoUrl } : {}) };
    });
    const classes = result[key].filter(row => row.kind === "class").length;
    if (key === "flex" ? classes !== 0 : classes !== 4) throw new Error(key === "flex" ? "Flex Day uses activities only, without rotation class slots." : `${key}: include exactly four class slots for the four rotation letters.`);
  }
  return result;
}

// Empty templates are the migration's initial state, never accepted on save.
export function normalizeTimetable(input: unknown): TimetableConfig {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (Object.keys(source).length === 0 || Object.values(source).every(value => Array.isArray(value) && value.length === 0)) return structuredClone(DEFAULT_TIMETABLE);
  return validateTimetable(input);
}

export function rotationLetters(title: string) {
  const match = title.toUpperCase().match(/^\s*(?:DAY\s*\d+\s*[-:]?\s*)?\(?\s*(XB|[A-H]{4})\s*\)?\s*$/);
  if (!match) return null;
  if (match[1] === "XB") return ["X"];
  const letters = match[1].split("");
  return new Set(letters).size === 4 ? letters : null;
}
export function rotationForDate(events: { date: string; title: string }[], date: string) {
  const daily = events.filter(item => item.date === date);
  if (daily.some(item => /\b(?:no school|school closed)\b/i.test(item.title))) return null;
  const rotations = daily.flatMap(item => { const letters = rotationLetters(item.title); return letters ? [{ title: item.title, letters }] : []; });
  if (new Set(rotations.map(item => item.letters.join(""))).size > 1) return null;
  return rotations[0] || null;
}
export function scheduleForDate(config: TimetableConfig, date: string, rotation: string[] | null) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!rotation || !Number.isFinite(weekday) || weekday === 0 || weekday === 6) return [];
  const weekdayTemplate = weekday === 1 ? config.monday : weekday === 2 ? config.tuesday : weekday === 3 ? config.wednesday : weekday === 4 ? config.thursday : weekday === 5 ? config.friday : config.monday;
  const periods = rotation?.length === 1 && rotation[0] === "X" ? config.flex : weekdayTemplate;
  let letterIndex = 0;
  return periods.map((period) => ({ ...period, letter: period.kind === "class" ? rotation?.[letterIndex++] || null : null }));
}
