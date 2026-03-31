import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TaskPaneApp from "./TaskPaneApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskPaneApp />
  </StrictMode>,
);
