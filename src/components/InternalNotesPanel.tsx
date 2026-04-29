import type { RefObject } from "react";
import { useState } from "react";
import type { EmailInternalNote } from "../types/actionDesk";

type InternalNotesPanelProps = {
  notes: EmailInternalNote[];
  composerRef?: RefObject<HTMLTextAreaElement | null>;
  onAddNote: (body: string) => void;
};

export function InternalNotesPanel({
  notes,
  composerRef,
  onAddNote,
}: InternalNotesPanelProps) {
  const [noteBody, setNoteBody] = useState("");

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {notes.length === 0 ? (
        <p style={emptyStyle}>No internal notes yet.</p>
      ) : (
        notes.map((note) => (
          <div
            key={note.id}
            style={{
              ...noteCardStyle,
              backgroundColor: "#fff7ed",
              borderColor: "#fed7aa",
            }}
          >
            <p style={metaStyle}>
              {note.authorName} | {new Date(note.createdAt).toLocaleString()}
            </p>
            <p style={bodyStyle}>{note.body}</p>
          </div>
        ))
      )}
      <textarea
        ref={composerRef}
        value={noteBody}
        onChange={(event) => setNoteBody(event.target.value)}
        rows={4}
        placeholder="Add an internal note for the team"
        style={textareaStyle}
      />
      <button
        type="button"
        onClick={() => {
          if (!noteBody.trim()) {
            return;
          }

          onAddNote(noteBody);
          setNoteBody("");
        }}
        style={buttonStyle}
      >
        Save Note
      </button>
    </div>
  );
}

const noteCardStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "12px",
};

const metaStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 700,
  color: "#9a3412",
};

const bodyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "14px",
  color: "#7c2d12",
  lineHeight: 1.6,
};

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "14px",
  color: "#64748b",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
  boxSizing: "border-box",
  resize: "vertical",
  minHeight: "96px",
  fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  justifySelf: "start",
  border: "1px solid #0f766e",
  backgroundColor: "#0f766e",
  color: "#ffffff",
  borderRadius: "10px",
  padding: "8px 12px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};
