FROM node:18-slim

WORKDIR /app

# Create data directory for GunDB persistence
RUN mkdir -p /data/radata && chown -R node:node /data

COPY package*.json ./
RUN npm install --production

COPY . .

# Environment variable for PORT (Cloud Run sets this automatically)
ENV PORT=8080
ENV GUN_FILE=/data/radata

# Expose the port
EXPOSE 8080

# Use the 'node' user for security
USER node

# Mount the volume
VOLUME ["/data"]

CMD [ "npm", "start" ]
