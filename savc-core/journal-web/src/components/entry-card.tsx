import Link from "next/link";
import TagPill from "@/components/tag-pill";
import type { Entry } from "@/lib/db";

export default function EntryCard({ entry }: { entry: Entry }) {
  const preview = entry.content.trim().slice(0, 140);

  return (
    <Link
      href={`/entry/${entry.id}`}
      className="paper group block rounded-2xl p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-amber-200/60 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300/40">
              {entry.date}
            </div>
            {entry.title ? (
              <div className="truncate text-sm font-medium text-zinc-900">
                {entry.title}
              </div>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-700">
            {preview || "（空白）"}
          </p>
        </div>
        {entry.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={entry.images[0]}
            className="h-16 w-16 flex-none rounded-xl object-cover ring-1 ring-black/5"
          />
        ) : null}
      </div>

      {entry.tags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.slice(0, 6).map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      ) : null}

      <div className="mt-3 text-xs text-zinc-500 opacity-0 transition group-hover:opacity-100">
        打开详情 →
      </div>
    </Link>
  );
}
