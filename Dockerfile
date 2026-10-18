FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["sh","-c","npx prisma db push --accept-data-loss && node prisma/seed.js && node src/server.js"]
