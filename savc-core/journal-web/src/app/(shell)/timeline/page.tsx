"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import EntryCard from "@/components/entry-card";
import TagPill from "@/components/tag-pill";
import { db, type Entry, normalizeTags } from "@/lib/db";

function download(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function TimelinePage() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dbc = db!;

  const all = useLiveQuery(async () => {
    const arr = await dbc.entries.toArray();
    return arr.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    (all ?? []).forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (all ?? []).filter((e) => {
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (!query) return true;
      const hay = `${e.date} ${e.title ?? ""} ${e.content} ${(e.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [all, q, tagFilter]);

  async function exportJSON() {
    const data = await dbc.entries.toArray();
    download(`journal-mvp-export-${Date.now()}.json`, JSON.stringify({ version: 1, entries: data }, null, 2));
  }

  async function importJSON(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as { version?: number; entries?: Entry[] };
    if (!parsed.entries?.length) return;
    await dbc.transaction("rw", dbc.entries, async () => {
      for (const e of parsed.entries!) {
        if (!e.id || !e.date) continue;
        await dbc.entries.put({
          id: e.id,
          date: e.date,
          title: e.title ?? "",
          content: e.content ?? "",
          tags: Array.isArray(e.tags) ? normalizeTags(e.tags.join(" ")) : [],
          images: Array.isArray(e.images) ? e.images : [],
          createdAt: e.createdAt ?? Date.now(),
          updatedAt: e.updatedAt ?? Date.now(),
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="paper rounded-3xl p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">时间轴</h1>
            <p className="mt-1 text-sm text-zinc-600">搜索、按标签过滤，进入回顾模式。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void exportJSON()}
              className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
            >
              导出 JSON
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
            >
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJSON(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索：文字/日期/标签…"
            className="w-full rounded-2xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-amber-300"
          />
          <button
            onClick={() => {
              setQ("");
              setTagFilter(null);
            }}
            className="rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
          >
            清空
          </button>
        </div>

        {allTags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setTagFilter(null)}
              className={`rounded-full px-3 py-1.5 text-xs ring-1 ring-black/5 ${
                tagFilter === null ? "bg-amber-200/60" : "bg-white/70 hover:bg-white"
              }`}
            >
              全部
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`rounded-full px-3 py-1.5 text-xs ring-1 ring-black/5 ${
                  tagFilter === t ? "bg-amber-200/60" : "bg-white/70 hover:bg-white"
                }`}
              >
                <TagPill tag={t} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3">
        {all === undefined ? (
          <div className="text-sm text-zinc-500">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="paper rounded-3xl p-6 text-sm text-zinc-600 ring-1 ring-black/5">
            没有匹配的记录。
          </div>
        ) : (
          filtered.map((e) => <EntryCard key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}
