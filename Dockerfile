FROM node:20-alpine
WORKDIR /app

# Copy workspace manifest first so dependency install caches well
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
COPY packages/web/package.json ./packages/web/

# Skip optional dev workspaces; install only what production needs
RUN npm install --workspace=@policyforge/core --workspace=@policyforge/web --omit=dev

# Copy source
COPY packages/core ./packages/core
COPY packages/web ./packages/web

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run as non-root for security
USER node

CMD ["node", "packages/web/src/server.js"]
