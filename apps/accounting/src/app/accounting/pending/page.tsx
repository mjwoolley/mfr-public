export default function PendingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-3xl">Your access is pending approval</h1>
      <p className="max-w-md text-muted">
        An admin needs to approve your account before you can use the family portal.
        You&apos;ll be notified by email once you&apos;re approved.
      </p>
    </div>
  );
}
