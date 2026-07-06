import { createApp } from "../server/src/app.js";

// Vercel's Node.js runtime accepts a plain (req, res) handler, which is
// exactly what an Express app instance is — no adapter needed. Building the
// app at module scope (not inside the handler) means a warm serverless
// instance reuses the same Express app, DB pool, and session store across
// invocations instead of rebuilding them on every request.
const app = createApp();

export default app;
