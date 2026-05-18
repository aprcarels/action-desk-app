const http = require("node:http");
const { URL } = require("node:url");

function createLoopbackRedirectUri(address) {
  const host =
    address?.address && address.address !== "::" ? address.address : "localhost";
  const hostname = host === "127.0.0.1" ? "localhost" : host;
  return `http://${hostname}:${address.port}`;
}

function parseLoopbackCallback(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");

  return {
    code: url.searchParams.get("code") ?? "",
    state: url.searchParams.get("state") ?? "",
    error: url.searchParams.get("error") ?? "",
    errorDescription: url.searchParams.get("error_description") ?? "",
  };
}

function startLoopbackAuthListener(options = {}) {
  const {
    expectedState,
    timeoutMs = 120000,
    successHtml = "<html><body><h2>Action Desk sign-in complete</h2><p>You can close this window.</p></body></html>",
    failureHtml = "<html><body><h2>Action Desk sign-in failed</h2><p>Please return to the app and try again.</p></body></html>",
    logger,
  } = options;

  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let settled = false;

    const server = http.createServer((req, res) => {
      const callback = parseLoopbackCallback(req.url || "/");

      logger?.info?.("auth", "Loopback auth callback received.", {
        hasCode: callback.code.length > 0,
        hasError: callback.error.length > 0,
      });

      const finalize = (error, code) => {
        if (settled) {
          return;
        }

        settled = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        server.close(() => {
          if (error) {
            waitForCodeReject(error);
            return;
          }

          waitForCodeResolve(code);
        });
      };

      res.statusCode = callback.code ? 200 : 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(callback.code ? successHtml : failureHtml);

      if (callback.error) {
        logger?.warn?.("auth", "Microsoft auth callback returned an error.", {
          error: callback.error,
          error_description: callback.errorDescription || undefined,
        });
        finalize(
          new Error(
            callback.errorDescription || "Microsoft sign-in returned an error.",
          ),
        );
        return;
      }

      if (!callback.code) {
        finalize(new Error("Microsoft sign-in did not return an authorization code."));
        return;
      }

      if (expectedState && callback.state !== expectedState) {
        finalize(new Error("Microsoft sign-in state validation failed."));
        return;
      }

      finalize(null, callback.code);
    });

    let waitForCodeResolve;
    let waitForCodeReject;
    const waitForCode = new Promise((innerResolve, innerReject) => {
      waitForCodeResolve = innerResolve;
      waitForCodeReject = innerReject;
    });

    server.on("error", (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(error);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(
          new Error(
            "Microsoft sign-in listener could not determine a localhost port.",
          ),
        );
        return;
      }

      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        server.close(() => {
          waitForCodeReject(
            new Error("Microsoft sign-in timed out before the browser returned."),
          );
        });
      }, timeoutMs);

      resolve({
        redirectUri: createLoopbackRedirectUri(address),
        waitForCode,
      });
    });
  });
}

module.exports = {
  createLoopbackRedirectUri,
  parseLoopbackCallback,
  startLoopbackAuthListener,
};
