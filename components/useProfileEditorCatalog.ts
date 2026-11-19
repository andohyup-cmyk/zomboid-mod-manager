"use client";

import { useEffect, useState } from "react";
import {
  mergeEditorCatalog,
  type EditorCatalogEntry,
  type EditorCatalogPage
} from "@/lib/profile-editor-catalog";

type CatalogRequest = { query: string; after: string | null };
type CatalogStatus = "loading" | "ready" | "error" | "denied";
type CatalogState = EditorCatalogPage & {
  request: CatalogRequest;
  knownEntries: readonly EditorCatalogEntry[];
  status: CatalogStatus;
};

export function useProfileEditorCatalog() {
  const [catalog, setCatalog] = useState<CatalogState>({
    request: { query: "", after: null },
    entries: [],
    knownEntries: [],
    nextCursor: null,
    status: "loading"
  });
  const { request } = catalog;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (request.query) params.set("q", request.query);
    if (request.after !== null) params.set("after", request.after);

    function reportFailure(status: "denied" | "error") {
      if (controller.signal.aborted) return;
      setCatalog((current) => current.request === request ? { ...current, status } : current);
    }

    async function fetchPage() {
      try {
        const response = await fetch(`/api/profile-catalog?${params}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          reportFailure(response.status === 401 || response.status === 403 ? "denied" : "error");
          return;
        }
        const page: EditorCatalogPage = await response.json();
        if (controller.signal.aborted) return;
        setCatalog((current) => {
          if (current.request !== request) return current;
          return {
            ...current,
            entries: request.after === null ? page.entries : mergeEditorCatalog(current.entries, page.entries),
            knownEntries: mergeEditorCatalog(current.knownEntries, page.entries),
            nextCursor: page.nextCursor,
            status: "ready"
          };
        });
      } catch {
        reportFailure("error");
      }
    }

    void fetchPage();
    return () => controller.abort();
  }, [request]);

  function loadCatalog(query: string, after: string | null = null) {
    setCatalog((current) => ({
      ...current,
      request: { query, after },
      entries: after === null ? [] : current.entries,
      nextCursor: after === null ? null : current.nextCursor,
      status: "loading"
    }));
  }

  return { catalog, loadCatalog };
}
