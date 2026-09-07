FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
COPY mobile/package.json mobile/package.json
RUN npm ci --ignore-scripts
COPY server server
COPY shared shared
RUN npm run build --workspace server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
COPY mobile/package.json mobile/package.json
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/server/dist server/dist
RUN mkdir -p /app/data/media && chown -R node:node /app/data
USER node
EXPOSE 4000
CMD ["node", "server/dist/src/index.js"]
