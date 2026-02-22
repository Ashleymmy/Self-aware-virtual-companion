export default function TagPill({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-900/5 px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-black/5">
      {tag}
    </span>
  );
}
