"use client";

import { useState, useTransition } from "react";
import { linkShareholderToUser, unlinkShareholder } from "@/actions/shareholders";

type SearchResult = { id: string; email: string; name: string | null };

export function LinkLoginControl({
  shareholderId,
  linkedEmail,
}: {
  shareholderId: string;
  linkedEmail: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentlyLinked, setCurrentlyLinked] = useState(linkedEmail);
  const [isPending, startTransition] = useTransition();

  async function handleSearch() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/accounting/api/admin/shareholder-search?email=${encodeURIComponent(query)}`,
      );
      if (!res.ok) {
        setError("Search failed");
        return;
      }
      const data: { users: SearchResult[] } = await res.json();
      setResults(data.users ?? []);
    } catch {
      setError("Search failed");
    } finally {
      setSearching(false);
    }
  }

  function handleLink(userId: string, email: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkShareholderToUser(shareholderId, userId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setCurrentlyLinked(email);
      setResults([]);
      setQuery("");
    });
  }

  function handleUnlink() {
    setError(null);
    startTransition(async () => {
      await unlinkShareholder(shareholderId);
      setCurrentlyLinked(null);
    });
  }

  return (
    <div className="mt-2 max-w-sm pt-6" style={{ borderTop: "1px solid var(--color-divider)" }}>
      <h2 className="text-base">Linked login</h2>
      <p className="text-muted mt-1 text-sm">
        {currentlyLinked ? `Linked to ${currentlyLinked}` : "Not yet signed in / linked."}
      </p>
      {currentlyLinked && (
        <button
          type="button"
          onClick={handleUnlink}
          disabled={isPending}
          className="mt-2 cursor-pointer text-sm font-semibold underline underline-offset-[3px] disabled:opacity-50"
          style={{ color: "var(--color-accent)" }}
        >
          Unlink
        </button>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email"
          className="input flex-1 text-sm"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || query.trim().length === 0}
          className="btn btn-primary flex-none"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm font-semibold" style={{ color: "var(--color-accent-800)" }}>
          {error}
        </p>
      )}

      {results.length > 0 && (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {results.map((u) => (
            <li key={u.id} className="flex items-center justify-between text-sm">
              <span>{u.email}</span>
              <button
                type="button"
                onClick={() => handleLink(u.id, u.email)}
                disabled={isPending}
                className="cursor-pointer font-semibold underline underline-offset-[3px] disabled:opacity-50"
                style={{ color: "var(--color-accent)" }}
              >
                Link
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
