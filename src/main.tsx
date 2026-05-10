import { createRoot } from "react-dom/client";
import "./index.css";
import { validateLocalEnvironment } from "@/lib/env";

validateLocalEnvironment();

void import("./App.tsx").then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(<App />);
});
