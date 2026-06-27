import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ProductionApp } from "./app/ProductionApp";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ProductionApp />
  </StrictMode>,
);
