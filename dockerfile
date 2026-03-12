FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY merch.html ./
COPY image5.webp ./
COPY gallery.html ./
COPY photos ./photos
COPY gallery ./gallery
COPY logos ./logos

EXPOSE 3000

CMD ["npm", "start"]
