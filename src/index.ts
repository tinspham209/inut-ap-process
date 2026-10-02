import { Hono } from "hono";
import { app as configuredApp } from "./configured-app.js";

if (!(configuredApp instanceof Hono)) {
  throw new Error("Configured application must be a Hono instance");
}

export default configuredApp;
