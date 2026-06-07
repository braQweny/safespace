import { CRISIS_RESOURCE_REGIONS } from "./crisis-resources";
import { openRouterSafetyProvider } from "./openrouter-classifier";
import { parseProviderDecisionObject } from "./parse-provider-decision";
import {
  ProviderSafetyError,
  type ProviderSafetyErrorCategory,
  type ProviderSafetyReasonCode,
  type SessionSafetyProvider,
} from "./provider";
import { getCautionSafetyCopy, getCrisisSafetyCopy, getSafetyUnavailableCopy } from "./safety-copy";
import type {
  ConstrainedSessionSafetyDecision,
  HardStopSessionSafetyDecision,
  SessionSafetyConstraint,
  SessionSafetyDecision,
  SessionSafetyInput,
} from "./types";

interface EvaluateSessionSafetyOptions {
  provider?: SessionSafetyProvider;
}

const CAUTION_SESSION_SAFETY_CONSTRAINTS = [
  {
    id: "avoid_diagnosis",
    instruction: "Do not diagnose the user or imply clinical assessment.",
  },
  {
    id: "avoid_risk_increasing_instructions",
    instruction: "Do not provide instructions that could increase risk to the user or another person.",
  },
  {
    id: "avoid_prescriptive_treatment_claims",
    instruction: "Do not prescribe treatment, medication, or a definitive therapeutic plan.",
  },
  {
    id: "supportive_non_clinical_language",
    instruction: "Use supportive, non-clinical language focused on reflection and organization of thoughts.",
  },
  {
    id: "include_escalation_boundary",
    instruction:
      "Briefly remind the user that immediate danger or escalation means the ordinary simulation cannot continue.",
  },
] as const satisfies readonly SessionSafetyConstraint[];

export async function evaluateSessionSafety(
  input: SessionSafetyInput,
  options: EvaluateSessionSafetyOptions = {},
): Promise<SessionSafetyDecision> {
  const provider = options.provider ?? openRouterSafetyProvider;

  try {
    const providerDecision = parseProviderDecisionObject(toRecord(await provider.classify(input)));

    if (providerDecision.risk === "normal") {
      return {
        risk: "normal",
        action: "allow",
        reasonCode: "none_detected",
        copy: null,
        constraints: [],
        crisisResources: [],
      };
    }

    if (providerDecision.risk === "caution") {
      return buildCautionDecision();
    }

    return buildCrisisDecision(resolveCrisisReasonCode(providerDecision.reasonCode));
  } catch (error) {
    return buildUnavailableDecision(resolveProviderErrorCategory(error));
  }
}

function buildCautionDecision(): ConstrainedSessionSafetyDecision {
  return {
    risk: "caution",
    action: "allow_with_constraints",
    reasonCode: "ambiguous_distress",
    copy: getCautionSafetyCopy(),
    constraints: CAUTION_SESSION_SAFETY_CONSTRAINTS,
    crisisResources: [],
  };
}

function buildCrisisDecision(reasonCode: HardStopSessionSafetyDecision["reasonCode"]): HardStopSessionSafetyDecision {
  return {
    risk: "crisis",
    action: "hard_stop",
    reasonCode,
    copy: getCrisisSafetyCopy(),
    constraints: [],
    crisisResources: CRISIS_RESOURCE_REGIONS,
  };
}

function buildUnavailableDecision(reasonCode: ProviderSafetyErrorCategory): HardStopSessionSafetyDecision {
  return {
    risk: "crisis",
    action: "hard_stop",
    reasonCode,
    copy: getSafetyUnavailableCopy(),
    constraints: [],
    crisisResources: CRISIS_RESOURCE_REGIONS,
  };
}

function toRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ProviderSafetyError("invalid_provider_response");
}

function resolveCrisisReasonCode(reasonCode: ProviderSafetyReasonCode): HardStopSessionSafetyDecision["reasonCode"] {
  if (
    reasonCode === "self_harm_signal" ||
    reasonCode === "harm_to_others_signal" ||
    reasonCode === "immediate_danger_signal"
  ) {
    return reasonCode;
  }

  throw new ProviderSafetyError("invalid_provider_response");
}

function resolveProviderErrorCategory(error: unknown): ProviderSafetyErrorCategory {
  if (error instanceof ProviderSafetyError) {
    return error.category;
  }

  return "provider_unavailable";
}
