export default function BlockedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">Access unavailable</h1>
      <p className="max-w-md text-black/60 dark:text-white/60">
        Your account does not currently have access to the family portal. Contact the
        site admin if you believe this is a mistake.
      </p>
    </div>
  );
}
