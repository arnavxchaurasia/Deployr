FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=8000
EXPOSE 8000

CMD ["npm", "start"]
