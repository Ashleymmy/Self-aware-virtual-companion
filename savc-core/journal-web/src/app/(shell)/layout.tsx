import TopNav from "@/components/top-nav";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <TopNav />
      <main className="pt-4">{children}</main>
    </div>
  );
}
