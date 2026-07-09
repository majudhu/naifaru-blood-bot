# Codex Instructions

- Assume this application always runs on Cloudflare Workers with the configured Cloudflare runtime, bindings, and latest enabled Worker features available.
- Do not add non-Cloudflare runtime compatibility branches, feature-availability checks, polyfills, local fallbacks, or `process.env` fallbacks for Worker bindings/config.
- Prefer direct Cloudflare APIs and generated `Env`/H3 Cloudflare context types.
- Let unexpected platform, config, and runtime failures throw naturally. Do not catch, parse, wrap, or recover from unexpected errors unless the user explicitly asks for that behavior.
- Keep validation for expected user input and business rules, but do not mask impossible deployment-state failures.
