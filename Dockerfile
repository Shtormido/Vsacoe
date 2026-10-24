# «Придорожный Мотель» в контейнере nginx: docker compose up -d → http://сервер:8080
ARG BASE=nginx:1.27-alpine
FROM ${BASE}
COPY deploy/nginx-docker.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY fonts /usr/share/nginx/html/fonts
COPY icons /usr/share/nginx/html/icons
EXPOSE 80
