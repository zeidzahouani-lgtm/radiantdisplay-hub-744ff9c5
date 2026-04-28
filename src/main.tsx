import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { logLocalEnvironmentDiagnostics, validateLocalEnvironment } from "@/lib/env";

validateLocalEnvironment();
logLocalEnvironmentDiagnostics();

createRoot(document.getElementById("root")!).render(<App />);
