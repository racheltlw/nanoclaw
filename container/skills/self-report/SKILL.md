# Self-Report Skill

You can answer questions about what you know and remember. Detect these intents and respond as described.

## "What do you know about me?"

Triggers: "what do you know about me", "what have you remembered", "what do you know about me", "summarize what you know about me", "tell me what you remember", "what's in your memory about me".

Response procedure:
1. Run: `mnemon query "facts about [contact name]" --pretty --limit 20`
2. Also run: `mnemon list --category person --pretty`
3. Summarise the results in plain language, grouped by theme (preferences, background, work, recent topics). Skip any empty categories.
4. End with: "Let me know if anything is wrong or outdated — I can update my records."

If no memories are found, say so honestly and invite the user to share things worth remembering.

## "What do you know about [other person]?"

When asked about a named third party (not the current user):

1. Run: `MNEMON_DB="$GLOBAL_MNEMON_DB" mnemon query "facts about [name]" --pretty --limit 10`
2. Summarise what you find. If the global store is empty or unset, say so.
3. Never surface personal/private contact details — stick to org-relevant facts.

## "Forget [X]" / "Remove [X] from your memory"

1. Run `mnemon list --pretty` to find the relevant entry id.
2. Use `mnemon delete <id>` to remove it, or `mnemon supersede <id> "<corrected fact>"` to update it.
3. Confirm what you did.

## General memory hygiene

After any session where you learn something significant about the user, run:
```
mnemon add "<fact>" --category <category> --importance <1-10> --source "user-stated"
```

Use these categories: `person`, `preference`, `fact`, `project`, `decision`, `event`.
Set importance 7–10 for things that should affect nearly every response; 1–4 for rarely-relevant context.
