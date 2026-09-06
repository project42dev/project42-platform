import { expect, type Locator } from "@playwright/test";

/**
 * Colour assertions that compare COLOURS, not the strings a browser happens to
 * serialise them into.
 *
 * A theme that composes a value with `color-mix(in srgb, ...)` serialises the
 * result as `color(srgb 0.0352941 0.0509804 0.0862745 / 0.96)`, while the same
 * colour written literally serialises as `rgba(9, 13, 22, 0.96)`. Those two
 * strings are the same colour. `toHaveCSS` compares strings, so every colour
 * assertion in this suite was one theme edit away from a false failure.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, Rgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

function channel(token: string, scale: number): number {
  const text = token.trim();
  if (text.endsWith("%")) {
    return (Number.parseFloat(text.slice(0, -1)) / 100) * 255;
  }
  if (text === "none") return 0;
  return Number.parseFloat(text) * scale;
}

function alpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const text = token.trim();
  if (text === "" || text === "none") return 1;
  if (text.endsWith("%")) return Number.parseFloat(text.slice(0, -1)) / 100;
  return Number.parseFloat(text);
}

/** Accepts rgb()/rgba() in legacy and space syntax, color(srgb ...), and hex. */
export function parseColor(value: string): Rgba {
  const input = value.trim().toLowerCase();
  if (input in NAMED) return NAMED[input];

  const hex = input.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    const expand =
      digits.length <= 4
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    const pair = (index: number) => Number.parseInt(expand.slice(index, index + 2), 16);
    return {
      r: pair(0),
      g: pair(2),
      b: pair(4),
      a: expand.length === 8 ? pair(6) / 255 : 1,
    };
  }

  const rgb = input.match(/^rgba?\((.+)\)$/);
  if (rgb) {
    const [components, alphaPart] = rgb[1].split("/");
    const parts = components.trim().split(/[\s,]+/).filter(Boolean);
    return {
      r: channel(parts[0], 1),
      g: channel(parts[1], 1),
      b: channel(parts[2], 1),
      a: alpha(alphaPart ?? parts[3]),
    };
  }

  const predefined = input.match(/^color\(\s*(srgb)\s+(.+)\)$/);
  if (predefined) {
    const [components, alphaPart] = predefined[2].split("/");
    const parts = components.trim().split(/\s+/).filter(Boolean);
    return {
      r: channel(parts[0], 255),
      g: channel(parts[1], 255),
      b: channel(parts[2], 255),
      a: alpha(alphaPart),
    };
  }

  throw new Error(`Unsupported colour value: ${value}`);
}

export function formatColor(color: Rgba): string {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${round(color.a)})`;
}

export function colorsMatch(actual: Rgba, expected: Rgba, tolerance = 1): boolean {
  // A fully transparent colour carries no channel information worth comparing.
  if (actual.a === 0 && expected.a === 0) return true;
  return (
    Math.abs(actual.r - expected.r) <= tolerance &&
    Math.abs(actual.g - expected.g) <= tolerance &&
    Math.abs(actual.b - expected.b) <= tolerance &&
    Math.abs(actual.a - expected.a) <= 0.01
  );
}

type ColorAssertionOptions = {
  message?: string;
  timeout?: number;
  tolerance?: number;
};

function read(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

/** Retries like `toHaveCSS` does, so this is not a flakier trade for a brittle one. */
export async function expectColor(
  locator: Locator,
  property: string,
  expected: string,
  options: ColorAssertionOptions = {},
): Promise<void> {
  const target = parseColor(expected);
  const canonical = formatColor(target);
  await expect
    .poll(
      async () => {
        const actual = await read(locator, property);
        try {
          return colorsMatch(parseColor(actual), target, options.tolerance)
            ? canonical
            : actual;
        } catch {
          return actual;
        }
      },
      { message: options.message, timeout: options.timeout ?? 5_000 },
    )
    .toBe(canonical);
}

export async function expectNotColor(
  locator: Locator,
  property: string,
  rejected: string,
  options: ColorAssertionOptions = {},
): Promise<void> {
  const target = parseColor(rejected);
  const canonical = formatColor(target);
  await expect
    .poll(
      async () => {
        const actual = await read(locator, property);
        try {
          return colorsMatch(parseColor(actual), target, options.tolerance)
            ? canonical
            : actual;
        } catch {
          return actual;
        }
      },
      { message: options.message, timeout: options.timeout ?? 5_000 },
    )
    .not.toBe(canonical);
}
