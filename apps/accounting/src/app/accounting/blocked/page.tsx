export default function BlockedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-3xl">Access unavailable</h1>
      <p className="max-w-md text-muted">
        Your account does not currently have access to the family portal. Contact the site admin if
        you believe this is a mistake.
      </p>
    </div>
  );
}
