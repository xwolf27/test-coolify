FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY image5.webp ./

EXPOSE 3000

CMD ["npm", "start"]
