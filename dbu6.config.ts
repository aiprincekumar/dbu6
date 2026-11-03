import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

// Register Windows ESM path normalization hook
try {
  register(pathToFileURL(join(import.meta.dirname, "scripts", "esm-loader.mjs")).href, import.meta.url);
} catch {
  // Ignore if already registered
}

export default {};
