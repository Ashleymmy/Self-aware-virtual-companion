"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createEntry } from "@/lib/entries";
import { normalizeTags, todayISO } from "@/lib/db";

export default function QuickAdd({ onCreated }: { onCreated?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const tags = useMemo(() => normalizeTags(tagsRaw), [tagsRaw]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 0);
  }, [open]);

  async function submit() {
    const text = content.trim();
    if (!text) return;
    const id = await createEntry({
      date: todayISO(),
      content: text,
      tags,
      images: [],
    });
    setContent("");
    setTagsRaw("");
    setOpen(false);
    onCreated?.(id);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 rounded-full bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:bg-zinc-800"
      >
        + 快速记录
        <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/80">
          ⌘K
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-4 shadow-xl ring-1 ring-black/10">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">今日快速记录</div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                关闭 Esc
              </button>
            </div>

            <textarea
              ref={taRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写点什么…（回车保存，Shift+Enter 换行）"
              rows={6}
              className="mt-3 w-full resize-none rounded-2xl bg-zinc-50 p-3 text-sm leading-6 outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-amber-300"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="标签：#工作 #心情（空格分隔）"
                className="w-full rounded-2xl bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-amber-300"
              />
              <button
                onClick={() => void submit()}
                className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 shadow-sm ring-1 ring-amber-300/40 hover:bg-amber-300"
              >
                保存
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">
              小技巧：⌘/Ctrl+K 打开快速记录；Shift+Enter 换行。
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
