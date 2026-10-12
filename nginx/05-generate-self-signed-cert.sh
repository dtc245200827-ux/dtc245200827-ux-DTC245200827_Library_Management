#!/bin/sh
set -eu

cert_dir=/etc/nginx/certs
cert_file="$cert_dir/cert.pem"
key_file="$cert_dir/key.pem"

if [ ! -s "$cert_file" ] || [ ! -s "$key_file" ]; then
    mkdir -p "$cert_dir"
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
    chmod 600 "$key_file"
fi