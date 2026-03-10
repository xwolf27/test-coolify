FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY image5.webp ./
COPY gallery.html ./
COPY photos ./photos
COPY gallery ./gallery

EXPOSE 3000

CMD ["npm", "start"]
