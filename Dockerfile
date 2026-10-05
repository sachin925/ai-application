FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY data/seed.json ./data/seed.json

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
