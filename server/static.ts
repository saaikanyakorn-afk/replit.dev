import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { salesDocShareHandler, contractOgHandler, creditNoteShareHandler, billingNoteShareHandler } from "./share-og";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.get("/share/quote/:token", (req, res, next) => { req.params.docType = "quote"; salesDocShareHandler(req, res, next); });
  app.get("/share/invoice/:token", (req, res, next) => { req.params.docType = "invoice"; salesDocShareHandler(req, res, next); });
  app.get("/share/tax-invoice/:token", (req, res, next) => { req.params.docType = "tax-invoice"; salesDocShareHandler(req, res, next); });
  app.get("/share/receipt/:token", (req, res, next) => { req.params.docType = "receipt"; salesDocShareHandler(req, res, next); });
  app.get("/share/order/:token", (req, res, next) => { req.params.docType = "order"; salesDocShareHandler(req, res, next); });
  app.get("/share/wht-cert/:token", (req, res, next) => { req.params.docType = "wht-cert"; salesDocShareHandler(req, res, next); });
  app.get("/share/credit-note/:token", creditNoteShareHandler);
  app.get("/share/billing-note/:token", billingNoteShareHandler);
  app.get("/sign/:token", contractOgHandler);

  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
