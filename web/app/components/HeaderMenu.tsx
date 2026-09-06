"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface HeaderMenuProps {
  /** Visible label on the trigger, or a node for an icon trigger. */
  label: ReactNode;
  /** Accessible name. Required when the label is an icon. */
  accessibleLabel?: string;
  /** Extra class on the trigger button. */
  triggerClassName?: string;
  /** Align the panel to the right edge of the trigger. */
  align?: "start" | "end";
  children: ReactNode;
}

/**
 * A disclosure, deliberately not an ARIA menu.
 *
 * role="menu" carries a contract this does not need and would have to earn:
 * roving tabindex, arrow-key navigation, and typeahead. These panels hold
 * ordinary links, so a button with aria-expanded plus a list of links is both
 * simpler and correct with a screen reader and keyboard.
 *
 * The panel stays in the DOM and is toggled with `hidden` rather than being
 * conditionally rendered. That keeps every destination present in the server
 * HTML, so the link checker, the GitHub Pages export, and crawlers all still
 * see them.
 */
export function HeaderMenu({
  label,
  accessibleLabel,
  triggerClassName,
  align = "start",
  children,
}: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape has to put focus back where it came from, or a keyboard user
      // is dropped at the top of the document.
      triggerRef.current?.focus();
    }
    // A link inside the panel navigates; on a client-side transition the panel
    // would otherwise stay open over the new page.
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget as Node | null;
      if (next && containerRef.current?.contains(next)) return;
      if (!next) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const container = containerRef.current;
    container?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      container?.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  return (
    <div className="header-menu" ref={containerRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={accessibleLabel}
        className={triggerClassName ? `header-menu-trigger ${triggerClassName}` : "header-menu-trigger"}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {label}
      </button>
      <div
        className={align === "end" ? "header-menu-panel header-menu-panel-end" : "header-menu-panel"}
        hidden={!open}
        id={panelId}
        onClick={() => setOpen(false)}
      >
        {children}
      </div>
    </div>
  );
}

/** The chevron on a text trigger. Decorative: the button already has a name. */
export function MenuChevron() {
  return (
    <svg
      aria-hidden="true"
      className="header-menu-chevron"
      focusable="false"
      viewBox="0 0 12 12"
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
