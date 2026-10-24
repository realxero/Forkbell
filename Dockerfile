# One image: the API server plus the exported web app, served from the same origin.
FROM node:22-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
# Files keep their host permissions; make sure the runtime user can read them.
RUN chmod -R a+rX packages/db/migrations
# Files keep their host permissions; make sure the runtime user can read them.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @forkbell/server build
RUN pnpm --filter @forkbell/app build:form
RUN cd apps/app && CI=1 npx expo export --platform web --output-dir /out/web
# Same for the exported web app (public/form keeps its host permissions): the runtime user must be able to read every folder.
RUN chmod -R a+rX /out/web

FROM node:22-bookworm-slim
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
