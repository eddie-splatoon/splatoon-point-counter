# Use a Node.js base image
FROM node:24-alpine

# Enable pnpm through corepack.
# The version is resolved from the "packageManager" field in package.json.
# Disable the download prompt so the build never blocks on interactive input.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application
# This assumes 'pnpm run build' generates production-ready assets
# For Next.js, this creates the .next folder
RUN pnpm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Define the command to start the application
# For Next.js, 'pnpm start' usually runs the production build
CMD ["pnpm", "start"]
