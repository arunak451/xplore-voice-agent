// Vercel entry point: every /api/* request is handled by the same Express app.
// Static files (widget.js, the demo page) are served by Vercel's CDN from public/.
import { app } from '../server/index.js';

export default app;
