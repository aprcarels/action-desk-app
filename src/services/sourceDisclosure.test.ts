import { describe, expect, it } from "vitest";
import {
  getAnalysisSourceDisclosure,
  getDraftSourceDisclosure,
} from "./sourceDisclosure";

describe("sourceDisclosure", () => {
  it("labels fallback analysis and drafts as rules-based", () => {
    expect(getAnalysisSourceDisclosure("fallback")).toMatchObject({
      label: "Rules-Based",
      kind: "rules_based",
    });
    expect(getDraftSourceDisclosure("fallback")).toMatchObject({
      label: "Rules-Based",
      kind: "rules_based",
    });
  });

  it("labels AI and hybrid analysis as AI assisted, not AI generated", () => {
    expect(getAnalysisSourceDisclosure("ai")).toMatchObject({
      label: "AI Assisted",
      kind: "ai_assisted",
    });
    expect(getAnalysisSourceDisclosure("hybrid")).toMatchObject({
      label: "AI Assisted",
      kind: "ai_assisted",
    });
    expect(getDraftSourceDisclosure("ai")).toMatchObject({
      label: "AI Assisted",
      kind: "ai_assisted",
    });
    expect(getDraftSourceDisclosure("hybrid")).toMatchObject({
      label: "Rules-Based",
      kind: "rules_based",
    });
  });

  it("fails gracefully when no source was stored", () => {
    expect(getAnalysisSourceDisclosure(undefined)).toMatchObject({
      label: "Source Unknown",
      kind: "unknown",
    });
  });
});
