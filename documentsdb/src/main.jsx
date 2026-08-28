import React from "react";
import { createRoot } from "react-dom/client";
import LogExplorer from "./LogExplorer.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LogExplorer tailRate={420} rowLimit={120} />
  </React.StrictMode>
);
