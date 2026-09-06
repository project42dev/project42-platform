import type { Provider } from "@project42/platform";

const labels: Record<Provider, string> = {
  "provider-neutral": "Core concept",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export function ProviderPills({ providers }: { providers: Provider[] }) {
  return (
    <div className="provider-pills" aria-label="Providers">
      {providers.map((provider) => (
        <span className={`provider-pill provider-pill-${provider}`} key={provider}>
          {labels[provider]}
        </span>
      ))}
    </div>
  );
}
