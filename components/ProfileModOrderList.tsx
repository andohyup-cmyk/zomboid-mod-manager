"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ProfileModSelection } from "@/lib/profile-mod-id-state";
import { profileModKey } from "@/lib/profile-mod-order";

type Props = {
  selections: readonly ProfileModSelection[];
  titles: ReadonlyMap<string, string>;
  categories: ReadonlyMap<string, string>;
  modInfoNotes?: ReadonlyMap<string, { warnings: number; infos: number }>;
  onMove: (from: number, to: number) => void;
  onInvalidPosition: () => void;
  onStateChange: (selection: ProfileModSelection, action: "enable" | "disable" | "remove") => void;
};

type DragSession = {
  pointerId: number;
  from: number;
  startY: number;
  currentY: number;
  to: number;
  frame: number | null;
};

function PositionInput({
  label, position, count, onMove, onInvalidPosition
}: {
  label: string;
  position: number;
  count: number;
  onMove: Props["onMove"];
  onInvalidPosition: Props["onInvalidPosition"];
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className="grid w-14 gap-1 text-center text-xs text-[#aab9c8]">
      순서
      <input
        className="field min-h-11 !px-1 !py-1 text-center font-semibold tabular-nums"
        aria-label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft ?? String(position)}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          setDraft(null);
          if (draft === null) return;
          const value = draft.trim();
          const next = Number(value);
          if (!/^\d+$/.test(value) || !Number.isInteger(next) || next < 1 || next > count) {
            onInvalidPosition();
            return;
          }
          onMove(position, next);
        }}
      />
    </label>
  );
}

export function ProfileModOrderList({
  selections, titles, categories, modInfoNotes, onMove, onInvalidPosition, onStateChange
}: Props) {
  const list = useRef<HTMLOListElement>(null);
  const session = useRef<DragSession | null>(null);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => () => {
    const drag = session.current;
    if (drag?.frame != null) window.cancelAnimationFrame(drag.frame);
    session.current = null;
  }, []);

  function dropPosition(clientY: number, fallback: number): number {
    const rows = list.current?.children;
    if (!rows?.length) return fallback;
    for (let index = 0; index < rows.length; index++) {
      if (clientY <= rows[index].getBoundingClientRect().bottom) return index + 1;
    }
    return rows.length;
  }

  function trackDrag() {
    const drag = session.current;
    if (!drag) return;
    const edge = Math.min(112, window.innerHeight / 4);
    const ratio = drag.currentY < edge
      ? (drag.currentY - edge) / edge
      : Math.max(0, drag.currentY - (window.innerHeight - edge)) / edge;
    if (ratio) window.scrollBy(0, Math.round(Math.max(-1, Math.min(1, ratio)) * 15));

    const next = dropPosition(drag.currentY, drag.to);
    if (drag.to !== next) {
      drag.to = next;
      setPreview({ from: drag.from, to: next });
    }
    drag.frame = window.requestAnimationFrame(trackDrag);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, position: number) {
    if (event.button !== 0 || session.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = {
      pointerId: event.pointerId,
      from: position,
      startY: event.clientY,
      currentY: event.clientY,
      to: position,
      frame: null
    };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = session.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.currentY = event.clientY;
    if (drag.frame === null && Math.abs(drag.currentY - drag.startY) >= 6) {
      setPreview({ from: drag.from, to: drag.from });
      drag.frame = window.requestAnimationFrame(trackDrag);
    }
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const drag = session.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    session.current = null;
    setPreview(null);
    if (drag.frame === null) return;
    window.cancelAnimationFrame(drag.frame);
    if (commit) onMove(drag.from, dropPosition(event.clientY, drag.to));
  }

  return (
    <ol ref={list} aria-label="프로필 모드 순서" className="grid gap-2.5">
      {selections.map((selection, index) => {
        const position = index + 1;
        const name = `${selection.modId} · ${selection.workshopId}`;
        const title = titles.get(selection.workshopId);
        const category = selection.primaryCategoryId
          ? categories.get(selection.primaryCategoryId) ?? selection.primaryCategoryId
          : "미확인";
        return (
          <li
            key={profileModKey(selection)}
            className={
              "panel grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 p-3 sm:gap-x-4 sm:p-4 "
              + (preview?.to === position ? "!border-[#a6d39b] ring-1 ring-[#a6d39b]" : "")
            }
          >
            <button
              type="button"
              className="secondary-action mt-0.5 grid min-h-11 w-11 touch-none cursor-grab place-items-center px-0 text-[#bbccd6] active:cursor-grabbing"
              aria-label={`${name} 순서 드래그`}
              aria-describedby="profile-order-help"
              onPointerDown={(event) => startDrag(event, position)}
              onPointerMove={moveDrag}
              onPointerUp={(event) => finishDrag(event, true)}
              onPointerCancel={(event) => finishDrag(event, false)}
              onLostPointerCapture={(event) => finishDrag(event, false)}
            >
              <span aria-hidden="true" className="grid grid-cols-2 gap-1">
                {Array.from({ length: 6 }, (_, dot) => (
                  <span key={dot} className="h-1 w-1 rounded-full bg-current" />
                ))}
              </span>
            </button>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#ecf2f8] [overflow-wrap:anywhere]">
                {title ?? selection.modId}
              </h3>
              <dl className="mt-1 space-y-0.5 text-xs [overflow-wrap:anywhere]">
                <div><dt className="muted mr-1.5 inline">Mod ID</dt><dd className="inline font-mono text-[#dbebf4]">{selection.modId}</dd></div>
                <div><dt className="muted mr-1.5 inline">Workshop ID</dt><dd className="inline font-mono text-[#b9c9d7]">{selection.workshopId}</dd></div>
              </dl>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-md bg-[#26384a] px-2 py-1 text-[#d0e0ef]">카테고리 {category}</span>
                <span className={`rounded-md px-2 py-1 ${selection.enabled ? "bg-[#223a2e] text-[#b9e6ae]" : "bg-[#2a303b] text-[#bac4d1]"}`}>
                  {selection.enabled ? "활성" : "비활성"}
                </span>
                {(() => {
                  const note = modInfoNotes?.get(selection.modId);
                  if (!note) return null;
                  return note.warnings + note.infos === 0
                    ? <span className="rounded-md bg-[#223a2e] px-2 py-1 text-[#b9e6ae]">mod.info 참고 일치</span>
                    : <span className={`rounded-md px-2 py-1 ${note.warnings ? "bg-[#3d3320] text-[#f2d6a0]" : "bg-[#2a303b] text-[#bac4d1]"}`}>
                      mod.info 경고 {note.warnings} · 참고 {note.infos}
                    </span>;
                })()}
              </div>
            </div>
            <PositionInput
              label={`${name} 순서 번호`}
              position={position}
              count={selections.length}
              onMove={onMove}
              onInvalidPosition={onInvalidPosition}
            />
            {preview?.from === position && (
              <p className="col-span-full text-xs text-[#b9e6ae]">{position}번에서 {preview.to}번으로 이동</p>
            )}
            <div className="col-span-full flex flex-wrap justify-end gap-2 border-t border-[#304154] pt-2.5 text-xs">
              <button
                type="button"
                className="secondary-action min-h-11 px-3 text-[#dce7ef]"
                aria-label={`${name} ${selection.enabled ? "비활성화" : "활성화"}`}
                onClick={() => onStateChange(selection, selection.enabled ? "disable" : "enable")}
              >
                {selection.enabled ? "비활성화" : "활성화"}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl border border-[#573942] px-3 text-[#f1b5bd] hover:bg-[#32232c]"
                aria-label={`${name} 제거`}
                onClick={() => onStateChange(selection, "remove")}
              >
                제거
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
