"use client";

import { useEffect, useState } from "react";
import { applyLayoutPreference, getActiveLayoutId, getAvailableLayouts } from "../../lib/layout";

export function LayoutSelector() {
  const [selected, setSelected] = useState(getActiveLayoutId);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setSelected(document.documentElement.dataset.layout ?? getActiveLayoutId()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="header-menu-footer">
      <label className="layout-selector-label" htmlFor="site-layout">Layout</label>
      <select
        id="site-layout"
        value={selected}
        onChange={(event) => {
          const id = applyLayoutPreference(event.target.value);
          setSelected(id);
          try { localStorage.setItem("project42.layout.v1", id); setStorageAvailable(true); }
          catch { setStorageAvailable(false); }
        }}
      >
        {getAvailableLayouts().map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
      {!storageAvailable && <p role="status">Applied for this visit. This browser could not save your layout.</p>}
    </div>
  );
}
