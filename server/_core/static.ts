import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { ENV } from "./env";

function buildRuntimeConfigScript(): string {
  const config = {
    VITE_APP_ID: ENV.appId,
    VITE_OAUTH_PORTAL_URL: ENV.oAuthPortalUrl,
  };
  return `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(config)}</script>`;
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");
  const configScript = buildRuntimeConfigScript();

  app.use("*", (_req, res) => {
    let html: string;
    try {
      html = fs.readFileSync(indexPath, "utf-8");
    } catch {
      res.status(500).send("index.html not found");
      return;
    }
    html = html.replace("</head>", `${configScript}</head>`);
    res.status(200).set({ "Content-Type": "text/html" }).send(html);
  });
}
