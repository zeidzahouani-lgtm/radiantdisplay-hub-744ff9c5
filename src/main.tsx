import { createRoot } from "react-dom/client";
import "./index.css";
import { logLocalEnvironmentDiagnostics, validateLocalEnvironment } from "@/lib/env";

validateLocalEnvironment();
logLocalEnvironmentDiagnostics();

void import("./App.tsx").then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(<App />);
});
