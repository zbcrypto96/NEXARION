FROM node:20-alpine

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY NEXARION/package*.json ./

RUN npm install --production

COPY NEXARION .

EXPOSE 3000

CMD ["npm", "start"]
