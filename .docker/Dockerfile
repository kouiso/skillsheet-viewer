FROM node:23.10.0-slim

WORKDIR /app

ARG ENV
# OS settings
ENV PATH /app/node_modules/.bin:$PATH

# OS lib
RUN apt-get update -qq \
  && apt-get install -qy --no-install-recommends \
  curl \
  procps \
  && rm -rf /var/lib/apt/lists/*

# node_module packages
COPY . .
RUN npm ci

USER node

CMD [ "npm", "run", "dev"]
