import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLoopbackRedirectUri,
  parseLoopbackCallback,
} = require("../../electron/authPkceHelpers.cjs") as {
  createLoopbackRedirectUri: (address: {
    address: string;
    port: number;
  }) => string;
  parseLoopbackCallback: (requestUrl: string) => {
    code: string;
    state: string;
    error: string;
    errorDescription: string;
  };
};

describe("electron auth PKCE helpers", () => {
  it("builds a localhost redirect uri from the loopback listener address", () => {
    expect(
      createLoopbackRedirectUri({
        address: "127.0.0.1",
        port: 43123,
      }),
    ).toBe("http://localhost:43123");
  });

  it("parses successful localhost auth callbacks", () => {
    expect(
      parseLoopbackCallback("/?code=abc123&state=state-1"),
    ).toEqual({
      code: "abc123",
      state: "state-1",
      error: "",
      errorDescription: "",
    });
  });

  it("parses error callbacks without exposing other request details", () => {
    expect(
      parseLoopbackCallback(
        "/?error=access_denied&error_description=User%20cancelled",
      ),
    ).toEqual({
      code: "",
      state: "",
      error: "access_denied",
      errorDescription: "User cancelled",
    });
  });
});
