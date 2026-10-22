import React from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { installMockApi } from "./mockApi";
import { DemoApp } from "./DemoApp";

installMockApi();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
);
