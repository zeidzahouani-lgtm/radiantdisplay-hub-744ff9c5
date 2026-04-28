import { createRoot } from "react-dom/client";
import "./index.css";
import { logLocalEnvironmentDiagnostics, validateLocalEnvironment } from "@/lib/env";

validateLocalEnvironment();
logLocalEnvironmentDiagnostics();

const { default: App } = await import("./App.tsx");

createRoot(document.getElementById("root")!).render(<App />);
