"use client";

import { useEffect, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";

type Args = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function useBoundedNumberInput({ value, min, max, onChange }: Args) {
  const [draft, setDraft] = useState(() => String(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraft(String(value));
  }, [isEditing, value]);

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const commit = (raw = draft) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return {
    value: isEditing ? draft : String(value),
    onFocus(event: FocusEvent<HTMLInputElement>) {
      setIsEditing(true);
      setDraft(String(value));
      event.currentTarget.select();
    },
    onChange(event: ChangeEvent<HTMLInputElement>) {
      const digits = event.target.value.replace(/\D/g, "");
      setDraft(digits);
      const parsed = Number.parseInt(digits, 10);
      if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
        onChange(parsed);
      }
    },
    onBlur(event: FocusEvent<HTMLInputElement>) {
      commit(event.currentTarget.value);
      setIsEditing(false);
    },
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        setDraft(String(value));
        setIsEditing(false);
        event.currentTarget.blur();
      }
    },
  };
}
