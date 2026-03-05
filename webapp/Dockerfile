# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --silent

# Copy sources
COPY . .

# Accept build-time API url (defaults to localhost:3000)
ARG VITE_API_URL="http://localhost:3000"
RUN export VITE_API_URL=${VITE_API_URL} && npm run build

# 1. Declaramos los argumentos que recibiremos (del compose o de GitHub Actions)
ARG VITE_API_URL
ARG VITE_GAMEY_URL

# 2. Los convertimos en variables de entorno reales para el proceso de build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GAMEY_URL=$VITE_GAMEY_URL

# 3. Ahora compilamos (Vite detectará las variables ENV automáticamente)
RUN npm run build


# Production image
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]