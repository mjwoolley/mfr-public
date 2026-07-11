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
    <div className="mt-2 max-w-sm border-t border-sand-200 pt-6">
      <h2 className="text-sm font-semibold">Linked login</h2>
      <p className="mt-1 text-sm text-stone-600">
        {currentlyLinked ? `Linked to ${currentlyLinked}` : "Not yet signed in / linked."}
      </p>
      {currentlyLinked && (
        <button
          type="button"
          onClick={handleUnlink}
          disabled={isPending}
          className="mt-2 text-sm underline disabled:opacity-50"
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
          className="flex-1 rounded border border-sand-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || query.trim().length === 0}
          className="rounded-full bg-lake-700 px-4 py-2 text-sm font-medium text-sand-50 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {results.map((u) => (
            <li key={u.id} className="flex items-center justify-between text-sm">
              <span>{u.email}</span>
              <button
                type="button"
                onClick={() => handleLink(u.id, u.email)}
                disabled={isPending}
                className="underline disabled:opacity-50"
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
