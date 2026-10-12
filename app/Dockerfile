FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=appuser:appuser src ./src
COPY --chown=appuser:appuser views ./views
COPY --chown=appuser:appuser public ./public

USER appuser
EXPOSE 3000
CMD ["node", "src/server.js"]