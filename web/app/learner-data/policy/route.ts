import { learnerDataPolicy } from "../../lib/learnerDataPolicy";

export async function GET() {
  return Response.json(learnerDataPolicy, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Content-Disposition": 'inline; filename="project-42-learner-data-policy.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
