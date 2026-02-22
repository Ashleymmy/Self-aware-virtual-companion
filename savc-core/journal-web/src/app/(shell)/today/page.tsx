"use client";

import { useLiveQuery } from "dexie-react-hooks";
import EntryCard from "@/components/entry-card";
import QuickAdd from "@/components/quick-add";
import { db, todayISO } from "@/lib/db";

export default function TodayPage() {
  const today = todayISO();
  const dbc = db!;

  const entries = useLiveQuery(
    async () => {
      const arr = await dbc.entries.where("date").equals(today).toArray();
      return arr.sort((a, b) => b.createdAt - a.createdAt);
    },
    [today]
  );

  return (
    <div className="space-y-4">
      <div className="paper rounded-3xl p-5 shadow-sm ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-600">今天</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{today}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              1–3 分钟写几句，回顾时像翻一本“轻杂志”。
            </p>
          </div>
          <div className="rounded-2xl bg-amber-200/50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300/40">
            本地保存 · 离线可用
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {entries === undefined ? (
          <div className="text-sm text-zinc-500">加载中…</div>
        ) : entries.length === 0 ? (
          <div className="paper rounded-3xl p-6 text-sm text-zinc-600 ring-1 ring-black/5">
            今天还没有记录。点右下角「快速记录」开始。
          </div>
        ) : (
          entries.map((e) => <EntryCard key={e.id} entry={e} />)
        )}
      </div>

      <QuickAdd />
    </div>
  );
}
