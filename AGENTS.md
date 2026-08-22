# Codex Instructions

- Assume this application always runs on Cloudflare Workers with the configured Cloudflare runtime, bindings, and latest enabled Worker features available.
- Do not add non-Cloudflare runtime compatibility branches, feature-availability checks, polyfills, local fallbacks, or `process.env` fallbacks for Worker bindings/config.
- Prefer direct Cloudflare APIs and generated `Env`/H3 Cloudflare context types.
- Let unexpected platform, config, and runtime failures throw naturally. Do not catch, parse, wrap, or recover from unexpected errors unless the user explicitly asks for that behavior.
- Keep validation for expected user input and business rules, but do not mask impossible deployment-state failures.

## Git commits

When asked to create a Git commit:

- Review the complete staged diff before choosing the commit message. If files are not staged yet, review the intended working-tree changes and stage only changes that belong to the task.
- Use a one-line commit only when the change is small, singular, and fully explained by a specific subject.
- Use a multi-line commit when it contains multiple meaningful changes, changes behavior in several ways, or needs rationale, migration details, compatibility notes, risks, or other context.
- Write the subject in the imperative mood, make it specific to the primary outcome, and keep it concise (preferably 72 characters or fewer).
- Avoid vague subjects such as "Improve flow", "Update files", "Various fixes", or "Fix issues".
- Separate a multi-line commit subject from its body with a blank line.
- Format a multi-change body as concise bullet points. Give each distinct behavior, configuration, schema, test, or documentation change its own bullet when it matters to understanding the commit.
- Explain why a change was made when the reason is not obvious from what changed.
- Mention breaking changes, migrations, compatibility effects, operational requirements, risks, or follow-up work when relevant.
- Mention verification only when it adds useful context, and never claim a test or check passed unless it was actually run successfully.
- Do not use the body merely to repeat the subject, list filenames, or narrate trivial implementation details.
- Ensure the final message describes only the changes included in the commit.
- After committing, report the commit hash and complete subject, and summarize the body when one was used.

Examples:

- A focused change may use only: `Ignore generated files in Ox tools`
- A commit with several outcomes should use a specific subject followed by a blank line and bullets describing those outcomes.

## Linting and formatting

- Prefer clear, idiomatic, conventional code over awkward code written only to satisfy a linter or formatter.
- First determine whether a diagnostic exposes a real correctness, safety, type-safety, or maintainability problem. Fix the underlying code when it does.
- Use the narrowest supported lint suppression when a diagnostic is a false positive, the intent is already obvious, or satisfying the rule would require substantially more code, confusing control flow, non-idiomatic patterns, or avoiding a mainstream language or framework convention without a concrete benefit.
- Prefer a rule-specific line or statement suppression for an isolated exception. Use a narrowly scoped configuration override when the same intentional pattern occurs repeatedly. Add a brief reason when the exception is not self-explanatory.
- For generated, vendored, downloaded, or copied files that should not be reformatted or linted, exclude the smallest appropriate file or directory through the Ox configuration instead of rewriting the contents.
- If a formatter cannot preserve valid, intentionally formatted source, ignore the smallest appropriate file or region rather than distorting the code.
- Never disable unrelated rules, suppress a genuine defect, or ignore an entire source area when a narrower exception works.
