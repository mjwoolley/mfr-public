import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/accounting");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900">Accounting</h1>
        <p className="mt-2 text-stone-600">
          Shareholder contribution &amp; ownership ledger for the Lake Lure lake house.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/accounting" });
        }}
      >
        <button
          type="submit"
          className="rounded-full bg-lake-700 px-6 py-3 text-sm font-medium text-sand-50 transition-colors hover:bg-lake-600"
        >
          Sign in with Google
        </button>
      </form>
    </div>
  );
}
