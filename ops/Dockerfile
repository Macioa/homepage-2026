# Local / self-hosted only; production is served by Netlify (netlify.toml)

# BUILD
FROM node:24-alpine AS build
WORKDIR /HomePage/
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# SERVE
FROM nginx:alpine
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /HomePage/dist/ /usr/share/nginx/html/
EXPOSE 80
