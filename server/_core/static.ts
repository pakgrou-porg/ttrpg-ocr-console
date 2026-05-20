import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import { ENV } from "./env";

function buildRuntimeConfigScript(): string {
  const config = {
    GOOGLE_CLIENT_ID: ENV.googleClientId,
    GOOGLE_API_KEY: ENV.googleApiKey,
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

  const indexPath = path.resolve(distPath, "index.html");
  const configScript = buildRuntimeConfigScript();

  function serveIndex(_req: Request, res: Response) {
    let html: string;
    try {
      html = fs.readFileSync(indexPath, "utf-8");
    } catch {
      res.status(500).send("index.html not found");
      return;
    }
    html = html.replace("</head>", `${configScript}</head>`);
    res.status(200).set({ "Content-Type": "text/html" }).send(html);
  }

  app.use(express.static(distPath, { index: false }));
  app.use("*", serveIndex);
}
