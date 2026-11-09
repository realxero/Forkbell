# Security

Forkbell holds health data, so security reports are welcome and taken
seriously.

## Reporting a vulnerability

Please report it privately through GitHub: the repository's **Security** tab →
**Report a vulnerability**. Don't open a public issue for it.

Include what you found, how to reproduce it, and which version or commit you
tested. You'll get a reply as soon as possible, and credit in the release notes
if you'd like it.

## Supported versions

Only the latest release on `main` gets fixes. Self-hosters should keep up to
date: pull, then `docker compose build --pull && docker compose up -d`
(see README.md).

## What's in scope

- One user reading or changing another user's data (row-level security, sharing).
- Sign-in, sessions, sign-in codes, Shortcut and MCP keys.
- Server-side requests made on a user's behalf (recipe import, web search, AI).
- Anything that leaks data in exports, logs or error messages.
