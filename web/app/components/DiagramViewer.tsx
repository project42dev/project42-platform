"use client";

import { useEffect, useRef, useState } from "react";

interface DiagramViewerProps {
  alt: string;
  height: number;
  src: string;
  title: string;
  width: number;
}

const minimumZoom = 100;
const maximumZoom = 400;
const zoomStep = 25;

export function DiagramViewer({
  alt,
  height,
  src,
  title,
  width,
}: DiagramViewerProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(minimumZoom);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((current) => Math.min(maximumZoom, current + zoomStep));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom((current) => Math.max(minimumZoom, current - zoomStep));
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        setZoom(minimumZoom);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const openViewer = () => {
    setZoom(minimumZoom);
    setOpen(true);
  };

  const updateZoom = (nextZoom: number) => {
    setZoom(Math.min(maximumZoom, Math.max(minimumZoom, nextZoom)));
  };

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="diagram-viewer-trigger"
        onClick={openViewer}
        ref={triggerRef}
        type="button"
      >
        {/* Preserve the reviewed SVG without an image-optimization rewrite. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} height={height} src={src} width={width} />
        <span className="diagram-viewer-trigger-label">
          Open full-screen viewer
        </span>
      </button>

      {open ? (
        <div
          aria-describedby="diagram-viewer-help"
          aria-labelledby="diagram-viewer-title"
          aria-modal="true"
          className="diagram-viewer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          ref={dialogRef}
          role="dialog"
        >
          <div className="diagram-viewer-toolbar">
            <div>
              <p className="diagram-viewer-kicker">Full-screen visual guide</p>
              <h2 id="diagram-viewer-title">{title}</h2>
            </div>
            <div
              aria-label="Zoom controls"
              className="diagram-viewer-controls"
              role="group"
            >
              <button
                aria-label="Zoom out"
                disabled={zoom === minimumZoom}
                onClick={() => updateZoom(zoom - zoomStep)}
                type="button"
              >
                −
              </button>
              <output aria-live="polite" htmlFor="diagram-viewer-image">
                {zoom}%
              </output>
              <button
                aria-label="Zoom in"
                disabled={zoom === maximumZoom}
                onClick={() => updateZoom(zoom + zoomStep)}
                type="button"
              >
                +
              </button>
              <button onClick={() => updateZoom(minimumZoom)} type="button">
                Reset
              </button>
              <button
                className="diagram-viewer-close"
                onClick={() => setOpen(false)}
                ref={closeRef}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
          <p className="sr-only" id="diagram-viewer-help">
            Scroll in either direction to inspect the visual. Use the zoom
            controls, plus and minus keys, or zero to reset. Press Escape to
            close.
          </p>
          <div className="diagram-viewer-viewport" tabIndex={0}>
            <div
              className="diagram-viewer-stage"
              style={{ width: `${zoom}%` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={alt}
                className="diagram-viewer-image"
                height={height}
                id="diagram-viewer-image"
                src={src}
                width={width}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
