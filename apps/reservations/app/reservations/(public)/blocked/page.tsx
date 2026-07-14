export default function BlockedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl">Access unavailable</h1>
      <p className="text-muted max-w-md">
        Your account does not currently have access to this site. Contact the site admin if you
        believe this is a mistake.
      </p>
    </main>
  )
}
