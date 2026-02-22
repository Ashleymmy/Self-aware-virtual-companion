"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TagPill from "@/components/tag-pill";
import { db, normalizeTags } from "@/lib/db";
import { deleteEntry, updateEntry } from "@/lib/entries";

async function fileToDataURL(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function EntryDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = params.id;
  const dbc = db!;

  const entry = useLiveQuery(() => dbc.entries.get(id), [id]);

  const neighbors = useLiveQuery(async () => {
    const arr = await dbc.entries.toArray();
    const sorted = arr.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
    const idx = sorted.findIndex((e) => e.id === id);
    return {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [id]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title ?? "");
    setContent(entry.content ?? "");
    setTagsRaw((entry.tags ?? []).join(" "));
  }, [entry]);

  const tags = useMemo(() => normalizeTags(tagsRaw), [tagsRaw]);

  async function save() {
    if (!entry) return;
    setSaving(true);
    try {
      await updateEntry(entry.id, {
        title: title.trim(),
        content,
        tags,
      });
    } finally {
      setSaving(false);
    }
  }

  async function onAddImages(files: FileList | null) {
    if (!entry || !files?.length) return;
    const next = [...(entry.images ?? [])];
    for (const f of Array.from(files)) {
      if (next.length >= 3) break;
      next.push(await fileToDataURL(f));
    }
    await updateEntry(entry.id, { images: next });
  }

  async function removeImage(idx: number) {
    if (!entry) return;
    const next = [...(entry.images ?? [])];
    next.splice(idx, 1);
    await updateEntry(entry.id, { images: next });
  }

  if (entry === undefined) {
    return <div className="text-sm text-zinc-500">加载中…</div>;
  }

  if (!entry) {
    return (
      <div className="paper rounded-3xl p-6 text-sm text-zinc-600 ring-1 ring-black/5">
        这条记录不存在或已被删除。<Link className="underline" href="/timeline">回时间轴</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="paper rounded-3xl p-5 shadow-sm ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full bg-amber-200/60 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300/40">
              {entry.date}
            </div>
            <div className="mt-2 text-xs text-zinc-500">像翻纸片一样回看：上一条 / 下一条</div>
          </div>
          <div className="flex items-center gap-2">
            {neighbors?.prev ? (
              <Link
                href={`/entry/${neighbors.prev.id}`}
                className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
              >
                ← 上一条
              </Link>
            ) : null}
            {neighbors?.next ? (
              <Link
                href={`/entry/${neighbors.next.id}`}
                className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
              >
                下一条 →
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（可选）"
            className="w-full rounded-2xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-amber-300"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="正文…"
            rows={10}
            className="w-full resize-none rounded-2xl bg-white p-3 text-sm leading-6 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-amber-300"
          />

          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="标签：#工作 #心情（空格分隔）"
            className="w-full rounded-2xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-amber-300"
          />

          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <TagPill key={t} tag={t} />
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 shadow-sm ring-1 ring-amber-300/40 hover:bg-amber-300 disabled:opacity-60"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button
                onClick={async () => {
                  const ok = confirm("确定删除这条记录吗？");
                  if (!ok) return;
                  await deleteEntry(entry.id);
                  router.push("/timeline");
                }}
                className="rounded-2xl bg-white px-3 py-2 text-sm text-red-600 ring-1 ring-black/5 hover:bg-zinc-50"
              >
                删除
              </button>
            </div>

            <div className="text-xs text-zinc-500">最多 3 张图（MVP：图片以 DataURL 本地保存）</div>
          </div>

          <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-black/5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">图片</div>
              <label className="cursor-pointer rounded-2xl bg-white px-3 py-1.5 text-sm ring-1 ring-black/5 hover:bg-zinc-50">
                + 添加
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void onAddImages(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {entry.images?.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {entry.images.map((src, idx) => (
                  <div key={idx} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="h-32 w-full rounded-2xl object-cover ring-1 ring-black/5"
                    />
                    <button
                      onClick={() => void removeImage(idx)}
                      className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-zinc-600">还没有图片。</div>
            )}
          </div>
        </div>
      </div>

      <div className="text-sm">
        <Link href="/timeline" className="text-zinc-700 underline">
          ← 回到时间轴
        </Link>
      </div>
    </div>
  );
}
