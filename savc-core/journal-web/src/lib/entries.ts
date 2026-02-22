import { nanoid } from "nanoid";
import { db, type Entry, todayISO } from "@/lib/db";

function requireDB() {
  if (!db) throw new Error("DB not available on server");
  return db;
}

export async function createEntry(partial: {
  date?: string;
  title?: string;
  content: string;
  tags?: string[];
  images?: string[];
}): Promise<string> {
  const now = Date.now();
  const id = nanoid();
  const entry: Entry = {
    id,
    date: partial.date ?? todayISO(),
    title: partial.title?.trim() || "",
    content: partial.content,
    tags: partial.tags ?? [],
    images: partial.images ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await requireDB().entries.add(entry);
  return id;
}

export async function updateEntry(
  id: string,
  patch: Partial<Omit<Entry, "id" | "createdAt">>
) {
  await requireDB().entries.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteEntry(id: string) {
  await requireDB().entries.delete(id);
}
