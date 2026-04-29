import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installBroadcastChannelPolyfill } from "./auth/installBroadcastChannelPolyfill";
import "./index.css";
import TaskPaneApp from "./TaskPaneApp";
import { setRuntimeEnv } from "./utils/env";

installBroadcastChannelPolyfill();
setRuntimeEnv(import.meta.env as Record<string, string | boolean | undefined>);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskPaneApp />
  </StrictMode>,
);
