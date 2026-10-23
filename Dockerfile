FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# `vite preview` serves dist/ and hosts the gRPC-Web proxy, so the runtime image
# keeps vite and the config's plugins (dev dependencies) alongside the build.
FROM node:22-alpine
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node --from=build /app/package.json /app/vite.config.ts ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/server ./server
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 4173
CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
