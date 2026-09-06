// A previously published URL for a Field Guide resource.
//
// The canonical location is /guide/resources/<id>: that is what sitemap.ts
// publishes and, since this change, what the Field Guide links to. This route
// stays because it was published first and is linked from outside, and it now
// re-exports rather than duplicating. The two files were byte-identical copies
// maintained in parallel, which is one edit away from serving two different
// pages at two URLs for the same resource.
export {
  default,
  generateMetadata,
  generateStaticParams,
} from "../../guide/resources/[resourceId]/page";
