"use client";

import { useState } from "react";

export function CopyCodeButton({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  };

  return (
    <span className="copy-code-control">
      <button onClick={copy} type="button">
        {status === "copied" ? "Copied" : "Copy"}
      </button>
      <span aria-live="polite" className="copy-code-status">
        {status === "copied"
          ? "Code copied to clipboard."
          : status === "error"
            ? "Copy failed. Select the text manually."
            : ""}
      </span>
    </span>
  );
}
