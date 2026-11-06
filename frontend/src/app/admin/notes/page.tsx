"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { useCurrentUser } from "@/hooks/queries/use-current-user";

type NoteDraft = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

const storagePrefix = "oceanic-notes-v1";
const timestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

function isNoteDraft(value: unknown): value is NoteDraft {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string" &&
    typeof note.title === "string" &&
    typeof note.content === "string" &&
    typeof note.updatedAt === "string";
}

export default function NotesPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user;
  const storageKey = user ? `${storagePrefix}:${user.businessId}:${user.id}` : "";
  const [notes, setNotes] = useState<NoteDraft[]>([]);
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [dirtyKey, setDirtyKey] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  useEffect(() => {
    if (!storageKey) return;
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        let drafts: NoteDraft[] = [];
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (!Array.isArray(parsed) || !parsed.every(isNoteDraft)) {
            throw new Error("Saved notes have an unexpected format.");
          }
          drafts = parsed;
        }
        setNotes(drafts);
        setActiveId("");
        setDirtyKey("");
        setSaveError("");
        setSaveState("saved");
        setLoadedKey(storageKey);
      } catch (cause) {
        setNotes([]);
        setActiveId("");
        setDirtyKey("");
        setSaveState("saved");
        setSaveError(cause instanceof Error ? cause.message : "Saved notes could not be loaded from this browser.");
        setLoadedKey(storageKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey || dirtyKey !== storageKey) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(notes));
        setSaveError("");
        setSaveState("saved");
      } catch (cause) {
        setSaveError(cause instanceof Error ? cause.message : "Your note could not be saved in this browser.");
        setSaveState("saved");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dirtyKey, loadedKey, notes, storageKey]);

  const activeNote = notes.find((note) => note.id === activeId) ?? null;
  const visibleNotes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...notes]
      .filter((note) => !needle || `${note.title} ${note.content}`.toLowerCase().includes(needle))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [notes, search]);

  function createNote() {
    const note: NoteDraft = {
      id: crypto.randomUUID(),
      title: "",
      content: "",
      updatedAt: new Date().toISOString(),
    };
    setDirtyKey(storageKey);
    setSaveState("saving");
    setNotes((current) => [note, ...current]);
    setActiveId(note.id);
  }

  function updateActiveNote(changes: Partial<Pick<NoteDraft, "title" | "content">>) {
    if (!activeId) return;
    setDirtyKey(storageKey);
    setSaveState("saving");
    setNotes((current) => current.map((note) =>
      note.id === activeId
        ? { ...note, ...changes, updatedAt: new Date().toISOString() }
        : note,
    ));
  }

  function deleteActiveNote() {
    if (!activeNote) return;
    setDirtyKey(storageKey);
    setSaveState("saving");
    setNotes((current) => current.filter((note) => note.id !== activeNote.id));
    setActiveId("");
  }

  if (userQuery.isLoading || !user || loadedKey !== storageKey) {
    return <AdminPageSkeleton variant="form" />;
  }

  return (
    <main className="mx-auto w-full max-w-screen-2xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-[#1a2a22]">Notes</h1>
          <p className="mb-0 mt-1 text-sm text-muted">Quick notes are saved as private drafts in this browser.</p>
        </div>
        <button type="button" onClick={createNote} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 text-sm text-white transition-colors hover:bg-brand-dark">
          <AdminUiIcon name="plus" size={16} /> New note
        </button>
      </header>

      {saveError && <p role="alert" className="m-0 rounded-lg border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a5554a]">Draft note storage error: {saveError}</p>}

      <section className="grid min-h-[min(680px,calc(100dvh-220px))] overflow-hidden rounded-xl border border-line bg-white shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-[240px] flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="grid gap-3 border-b border-line p-4">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-sm font-semibold text-[#35453b]">Drafts</h2>
              <span className="rounded-full bg-[#f3f5f3] px-2 py-1 text-xs text-muted">{notes.length}</span>
            </div>
            <input
              aria-label="Search notes"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes"
              className="h-10 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[#eaf3ec]"
            />
          </div>
          <div className="max-h-72 overflow-y-auto lg:max-h-none lg:flex-1">
            {!visibleNotes.length ? (
              <div className="p-3">
                <AdminEmptyState
                  icon="edit"
                  title={notes.length ? "No matching notes" : "No drafts yet"}
                  description={notes.length ? "Try another search." : "Create a note and it will be saved here automatically."}
                />
              </div>
            ) : visibleNotes.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => setActiveId(note.id)}
                className={`grid w-full cursor-pointer gap-1 border-b border-[#edf1ed] p-4 text-left transition-colors hover:bg-[#f8faf8] ${activeId === note.id ? "border-l-2 border-l-brand bg-[#f3f8f4]" : "bg-white"}`}
              >
                <strong className="w-full truncate text-sm font-medium text-[#35453b]">{note.title.trim() || "Untitled note"}</strong>
                <span className="line-clamp-2 min-h-8 text-xs leading-4 text-muted">{note.content.trim() || "No additional text"}</span>
                <time className="mt-1 text-[11px] text-[#929d95]">{timestamp(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[420px] min-w-0 flex-col">
          {activeNote ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-7">
                <span className="inline-flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
                  <span className={`size-2 rounded-full ${saveState === "saved" ? "bg-[#54a576]" : "animate-pulse bg-[#d49a3a]"}`} />
                  {saveState === "saved" ? "Draft saved" : "Saving draft..."}
                </span>
                <button type="button" onClick={deleteActiveNote} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs text-[#8e5c52] transition-colors hover:bg-[#fff5f2]">
                  <AdminUiIcon name="trash" size={14} /> Delete
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5 sm:p-7">
                <input
                  aria-label="Note title"
                  value={activeNote.title}
                  onChange={(event) => updateActiveNote({ title: event.target.value })}
                  placeholder="Untitled note"
                  maxLength={180}
                  className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-[#1a2a22] outline-none placeholder:text-[#b2bcb5] focus:ring-0 sm:text-3xl"
                />
                <textarea
                  aria-label="Note content"
                  value={activeNote.content}
                  onChange={(event) => updateActiveNote({ content: event.target.value })}
                  placeholder="Write something down..."
                  className="min-h-[320px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-7 text-[#46554b] outline-none placeholder:text-[#aeb8b0] focus:ring-0"
                />
                <p className="m-0 border-t border-[#edf1ed] pt-3 text-xs text-muted">Draft · Last edited {timestamp(activeNote.updatedAt)}</p>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="edit" size={22} /></span>
                <h2 className="m-0 text-base font-semibold text-[#35453b]">Your notes, ready when you are</h2>
                <p className="mx-auto mb-4 mt-2 max-w-sm text-sm text-muted">Create a draft for quick reminders, ideas, or details you want to keep handy.</p>
                <button type="button" onClick={createNote} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-sm text-white hover:bg-brand-dark"><AdminUiIcon name="plus" size={15} /> Create a note</button>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
