import type { LearningActivity as LearningActivityContract } from "@project42/platform";

export function LearningActivity({
  activity,
}: {
  activity: LearningActivityContract;
}) {
  return (
    <section className="learning-activity" aria-labelledby={`${activity.id}-title`}>
      <p className="eyebrow">Practice activity</p>
      <h2 id={`${activity.id}-title`}>{activity.title}</h2>
      <ol>
        {activity.instructions.map((instruction, index) => (
          <li key={`${activity.id}-instruction-${index}`}>{instruction}</li>
        ))}
      </ol>

      <div className="activity-evidence">
        <h3>What to produce</h3>
        <ul>
          {activity.evidence.map((item, index) => (
            <li key={`${activity.id}-evidence-${index}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="activity-reflection">
        <h3>Reflect before continuing</h3>
        <p>{activity.reflectionPrompt}</p>
      </div>
    </section>
  );
}
