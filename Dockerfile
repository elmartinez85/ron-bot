FROM node:20-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

RUN mkdir -p /data
WORKDIR /data

CMD ["node", "/app/index.js"]
