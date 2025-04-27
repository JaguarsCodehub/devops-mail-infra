# Use Node.js LTS version
FROM node:20-slim

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the app code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose your app's port (3000)
EXPOSE 3000

# Default command to run the app
CMD ["npm", "start"]
