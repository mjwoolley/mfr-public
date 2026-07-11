import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/accounting");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <h1 className="text-3xl">Accounting</h1>
        <p className="text-muted mt-2">
          Shareholder contribution &amp; ownership ledger for the Lake Lure lake house.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/accounting" });
        }}
      >
        <button type="submit" className="btn btn-primary px-6 py-3">
          Sign in with Google
        </button>
      </form>
    </div>
  );
}
