import { ShareholderForm } from "./shareholder-form";

export default function NewShareholderPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Add shareholder</h1>
      <p className="mt-2 text-stone-600">
        They&apos;ll appear in transaction entry forms immediately. When they later sign in with
        Google using this email, their account links automatically.
      </p>
      <ShareholderForm />
    </div>
  );
}
