import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit and resolve every route in its canonical trailing-slash form.
  //
  // The published site is a static artifact: each route is written as
  // <route>/index.html, so the host serves it at "/learn/" and answers "/learn"
  // with a 301 to it. Links were written without the slash -- href="/learn",
  // "/guide", "/ondemand", "/resources/<id>", site-wide -- so every navigation
  // spent a redirect round trip before it fetched anything. The Pages export
  // installs a shim that turns each internal click into a real document load,
  // so that cost was paid on every click, not only the first.
  //
  // Set here rather than by editing ~110 href sites, so it is a property of the
  // build and a link added tomorrow is canonical without anyone remembering.
  trailingSlash: true,
};

export default nextConfig;
