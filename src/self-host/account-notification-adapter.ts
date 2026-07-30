import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DisabledAccountNotificationAdapter,
  type AccountNotificationAdapter,
} from "../account-notifications.js";

export const ACCOUNT_NOTIFICATION_ADAPTER_FACTORY_EXPORT =
  "createAccountNotificationAdapter" as const;

export interface AccountNotificationAdapterModule {
  createAccountNotificationAdapter:
    () =>
      | AccountNotificationAdapter
      | Promise<AccountNotificationAdapter>;
}

export async function loadAccountNotificationAdapter(
  moduleSpecifier: string | null,
): Promise<AccountNotificationAdapter> {
  if (!moduleSpecifier) return new DisabledAccountNotificationAdapter();
  const normalizedSpecifier = isAbsolute(moduleSpecifier)
    ? pathToFileURL(moduleSpecifier).href
    : moduleSpecifier;
  const imported = (await import(
    normalizedSpecifier
  )) as Partial<AccountNotificationAdapterModule>;
  if (
    typeof imported.createAccountNotificationAdapter !== "function"
  ) {
    throw new Error(
      `Account notification adapter module must export ${ACCOUNT_NOTIFICATION_ADAPTER_FACTORY_EXPORT}().`,
    );
  }
  const adapter = await imported.createAccountNotificationAdapter();
  if (
    !adapter ||
    typeof adapter.kind !== "string" ||
    !adapter.kind.trim() ||
    adapter.kind.length > 100 ||
    typeof adapter.deliver !== "function"
  ) {
    throw new Error(
      "Account notification adapter factory returned an invalid adapter.",
    );
  }
  return adapter;
}
