export default function PendingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl">Your access is pending approval</h1>
      <p className="text-muted max-w-md">
        An admin needs to approve your account before you can view or book the cabin
        calendar. You&apos;ll be notified by email once you&apos;re approved.
      </p>
    </main>
  )
}
