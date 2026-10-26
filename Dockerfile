# One image: the API server plus the exported web app, served from the same origin.
# Node 24 LTS (supported until April 2028). Build with --pull so Docker fetches the
# newest Node 24 instead of reusing an old copy; the check below stops a build on a
# Node with a known security hole (CVE-2026-111497, fixed in 24.22.1).
FROM node:24-bookworm-slim AS build
COPY scripts/check-node.mjs /tmp/check-node.mjs
RUN node /tmp/check-node.mjs
WORKDIR /src
RUN corepack enable
COPY . .
# Files keep their host permissions; make sure the runtime user can read them.
RUN chmod -R a+rX packages/db/migrations
RUN pnpm install --frozen-lockfile
# Stamp the version and commit into the server and the web app (shown in
# Settings, /healthz and the x-forkbell-version header). The commit comes from
# .git when it's in the build folder, or pass it: --build-arg GIT_SHA=$(git rev-parse HEAD)
ARG GIT_SHA=
ARG FORKBELL_BUILD_NUMBER=
RUN GIT_SHA=$GIT_SHA FORKBELL_BUILD_NUMBER=$FORKBELL_BUILD_NUMBER node scripts/build-info.mjs
RUN pnpm --filter @forkbell/server build
RUN pnpm --filter @forkbell/app build:form
RUN cd apps/app && CI=1 npx expo export --platform web --output-dir /out/web
# Same for the exported web app (public/form keeps its host permissions): the runtime user must be able to read every folder.
RUN chmod -R a+rX /out/web

FROM node:24-bookworm-slim
COPY scripts/check-node.mjs /tmp/check-node.mjs
RUN node /tmp/check-node.mjs
WORKDIR /app
ENV NODE_ENV=production WEB_DIR=/app/web MIGRATIONS_DIR=/app/migrations PORT=3000
COPY docker/runtime-package.json package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/packages/db/migrations ./migrations
COPY --from=build /out/web ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
