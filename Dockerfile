FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate up && node src/server.js"]
