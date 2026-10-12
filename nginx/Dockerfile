FROM nginx:1.27-alpine

RUN apk add --no-cache openssl \
    && mkdir -p /etc/nginx/certs

COPY default.conf /etc/nginx/conf.d/default.conf
COPY 05-generate-self-signed-cert.sh /docker-entrypoint.d/05-generate-self-signed-cert.sh
RUN chmod 755 /docker-entrypoint.d/05-generate-self-signed-cert.sh

EXPOSE 80 443