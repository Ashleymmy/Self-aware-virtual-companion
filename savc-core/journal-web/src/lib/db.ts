import Dexie, { type Table } from "dexie";

export type Entry = {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string;
  content: string;
  tags: string[];
  images: string[]; // data URLs (MVP)
  createdAt: number;
  updatedAt: number;
};

class JournalDB extends Dexie {
  entries!: Table<Entry, string>;

  constructor() {
    super("journal_mvp");
    this.version(1).stores({
      entries: "id, date, createdAt, updatedAt, *tags",
    });
  }
}

export const db: JournalDB | null = typeof window === "undefined" ? null : new JournalDB();

export function todayISO(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeTags(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .map((t) => t.replace(/#+/g, "#"))
    .filter((t, idx, arr) => arr.indexOf(t) === idx);
}
