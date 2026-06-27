import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PlaygroundApp } from "./app/PlaygroundApp";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PlaygroundApp />
  </StrictMode>,
);
