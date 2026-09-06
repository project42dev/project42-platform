import config from "../project42.config.json";

export function getActiveLayoutId(): string {
  return config.layout.defaultPreset;
}

export function getLayoutAssets(layoutId?: string) {
  const active = layoutId || getActiveLayoutId();
  return { id: active, stylesheet: `/layouts/${active}/layout.css` };
}
