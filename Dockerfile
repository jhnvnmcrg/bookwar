# Bookwar as one long-lived Node process: live games keep their rooms in memory, so run a
# single instance (not serverless functions).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The browser signs in through this URL, so it is built into the client code.
ARG VITE_NEON_AUTH_URL
ENV VITE_NEON_AUTH_URL=${VITE_NEON_AUTH_URL}
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	TRUST_PROXY=1
# The build output carries its own dependencies.
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
