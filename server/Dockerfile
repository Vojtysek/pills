# Lékárnička push server. Node 24 runs the TypeScript sources directly (type stripping) and ships node:sqlite.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/lekarnicka.db

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir /data && chown node:node /data
USER node

VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=1m --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/index.ts"]
