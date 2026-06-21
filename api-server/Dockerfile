FROM node:20-alpine
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

ENV PORT=9000
EXPOSE 9000
EXPOSE 9002

CMD ["npm", "start"]
