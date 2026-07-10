export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Miller Family Reunions</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          Tools for the Lake Lure lake house.
        </p>
      </div>
      <a
        href="/accounting"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Go to Accounting
      </a>
    </div>
  );
}
