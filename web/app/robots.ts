import type { MetadataRoute } from "next";
import { canonicalOrigin } from "../lib/copy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${canonicalOrigin}/sitemap.xml`,
  };
}
