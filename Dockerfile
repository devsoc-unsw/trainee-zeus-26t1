# Dev container for Code Telephone (trainee-zeus-26t1).
#
# Production deploys go to Vercel (see Plan 4). This image exists for
# local team parity — anyone with Docker can run the app without
# installing Node directly.
#
# Single dev stage. If a production target is needed later, add a
# `runner` stage that runs `next build` against this same base and
# serves with `next start`.

FROM node:20-alpine AS dev

WORKDIR /app

# Install deps in their own layer so source-only edits hit a cache hit.
COPY package.json package-lock.json ./
RUN npm ci

# Source. In docker-compose, this gets shadowed by the bind mount for
# hot reload — the COPY makes the image runnable standalone too.
COPY . .

# Polling-based file watching for cross-OS bind mounts (WSL, macOS).
ENV WATCHPACK_POLLING=true

EXPOSE 3000
CMD ["npm", "run", "dev"]
