import config from "../project42.config.json";

export const layoutPresets = [
  { id: "standard", name: "Standard" },
  { id: "compact", name: "Compact" },
  { id: "wide", name: "Wide" },
  { id: "enterprise", name: "Enterprise" },
];

export function getAvailableLayouts() {
  const configured = config.layout as { defaultPreset: string; availablePresets?: string[] };
  const ids = [...new Set([...(configured.availablePresets ?? layoutPresets.map((preset) => preset.id)), configured.defaultPreset])];
  return ids.map((id) => ({ id, name: layoutPresets.find((preset) => preset.id === id)?.name ?? id }));
}

export function resolveLayoutPreference(value: string | null): string {
  return getAvailableLayouts().some((preset) => preset.id === value)
    ? value!
    : config.layout.defaultPreset;
}

export function applyLayoutPreference(value: string | null): string {
  const id = resolveLayoutPreference(value);
  document.documentElement.dataset.layout = id;
  return id;
}

export function getActiveLayoutId(): string {
  return config.layout.defaultPreset;
}

export function getLayoutAssets(layoutId?: string) {
  const active = layoutId || getActiveLayoutId();
  return { id: active, stylesheet: `/layouts/${active}/layout.css` };
}
