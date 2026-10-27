import "@fontsource/cormorant-garamond/300.css";
import "@fontsource/cormorant-garamond/300-italic.css";
import "@fontsource/dm-sans/400.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
