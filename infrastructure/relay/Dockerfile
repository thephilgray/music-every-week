FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Environment variable for PORT (Cloud Run sets this automatically)
ENV PORT=8080
ENV GUN_FILE=/data/radata

# Expose the port
EXPOSE 8080

CMD [ "npm", "start" ]
