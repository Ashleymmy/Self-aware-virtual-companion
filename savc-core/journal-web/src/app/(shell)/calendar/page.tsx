"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const dbc = db!;
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();

  const monthPrefix = ymKey(cursor);

  const counts = useLiveQuery(async () => {
    const arr = await dbc.entries
      .filter((e) => e.date.startsWith(monthPrefix))
      .toArray();
    const map = new Map<string, number>();
    for (const e of arr) map.set(e.date, (map.get(e.date) ?? 0) + 1);
    return map;
  }, [monthPrefix]);

  const grid = useMemo(() => {
    const first = new Date(year, monthIndex, 1);
    const startDow = (first.getDay() + 6) % 7; // Monday=0
    const total = daysInMonth(year, monthIndex);
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null });
    for (let day = 1; day <= total; day++) {
      const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ date, day });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [year, monthIndex]);

  return (
    <div className="space-y-4">
      <div className="paper rounded-3xl p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">日历回顾</h1>
            <p className="mt-1 text-sm text-zinc-600">有记录的日期会更“深”。点一下跳到时间轴搜索。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(new Date(year, monthIndex - 1, 1))}
              className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
            >
              上月
            </button>
            <button
              onClick={() => setCursor(new Date())}
              className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
            >
              回到本月
            </button>
            <button
              onClick={() => setCursor(new Date(year, monthIndex + 1, 1))}
              className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5 hover:bg-zinc-50"
            >
              下月
            </button>
          </div>
        </div>

        <div className="mt-3 text-2xl font-semibold tracking-tight">{monthPrefix}</div>

        <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-zinc-600">
          {"一二三四五六日".split("").map((w) => (
            <div key={w} className="px-1">
              {w}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {grid.map((c, idx) => {
            if (!c.date) return <div key={idx} className="h-12 rounded-2xl" />;
            const n = counts?.get(c.date) ?? 0;
            const intensity = n === 0 ? "bg-white/40" : n === 1 ? "bg-amber-200/45" : n === 2 ? "bg-amber-300/55" : "bg-amber-400/65";
            return (
              <Link
                key={c.date}
                href={`/timeline?q=${encodeURIComponent(c.date)}`}
                className={`relative flex h-12 items-center justify-center rounded-2xl ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-sm ${intensity}`}
              >
                <span className="text-sm font-medium text-zinc-900">{c.day}</span>
                {n > 0 ? (
                  <span className="absolute bottom-1 right-1 rounded-full bg-zinc-900/70 px-1.5 py-0.5 text-[10px] text-white">
                    {n}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
