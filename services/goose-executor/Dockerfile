# services/goose-executor/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.json /app/
RUN npm install --omit=dev

COPY src /app/src

EXPOSE 9200
CMD ["node", "--experimental-strip-types", "src/main.ts"]
