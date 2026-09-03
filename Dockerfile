# Use a Node.js base image
FROM node:24-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Next.js application
# This assumes 'npm run build' generates production-ready assets
# For Next.js, this creates the .next folder
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Define the command to start the application
# For Next.js, 'npm run start' usually runs the production build
CMD ["npm", "start"]
