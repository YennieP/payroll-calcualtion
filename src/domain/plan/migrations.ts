import { DEFAULT_TAX_RULE_SET_ID } from "../tax/rules/us-ca-w2-2026";
import type { PlanDocument } from "./types";
import { CURRENT_PLAN_SCHEMA_VERSION } from "./types";
import { parsePlanDocument } from "./validation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class PlanMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanMigrationError";
  }
}

/**
 * Version 0 was the pre-MVP draft shape. Its identifiers and source inputs are
 * preserved; version 1 only adds explicit planning-year and rule-set defaults.
 */
function migrateVersion0(value: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(value.taxProfile)) {
    throw new PlanMigrationError("Version 0 plan is missing taxProfile.");
  }

  return {
    ...value,
    schemaVersion: 1,
    taxProfile: {
      ...value.taxProfile,
      planningYear: 2026,
      taxRuleVersion:
        typeof value.taxProfile.taxRuleVersion === "string"
          ? value.taxProfile.taxRuleVersion
          : DEFAULT_TAX_RULE_SET_ID,
    },
  };
}

export function migratePlanDocument(value: unknown): PlanDocument {
  if (!isRecord(value)) {
    throw new PlanMigrationError("Persisted plan must be an object.");
  }
  if (!Number.isInteger(value.schemaVersion)) {
    throw new PlanMigrationError("Persisted plan is missing an integer schemaVersion.");
  }
  if (Number(value.schemaVersion) > CURRENT_PLAN_SCHEMA_VERSION) {
    throw new PlanMigrationError(
      `Plan schema ${String(value.schemaVersion)} is newer than supported schema ${CURRENT_PLAN_SCHEMA_VERSION}.`,
    );
  }

  let migrated: Record<string, unknown> = value;
  let version = Number(value.schemaVersion);
  while (version < CURRENT_PLAN_SCHEMA_VERSION) {
    if (version === 0) migrated = migrateVersion0(migrated);
    else throw new PlanMigrationError(`No migration is registered for plan schema ${version}.`);
    version += 1;
  }

  return parsePlanDocument(migrated);
}
