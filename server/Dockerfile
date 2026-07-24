FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y curl git && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /home/app

COPY package*.json ./
RUN npm ci

COPY main.sh main.sh
COPY script.js script.js
COPY kafka-certs ./kafka-certs

RUN chmod +x main.sh

RUN useradd -r -s /bin/false appuser && chown -R appuser /home/app
USER appuser

ENTRYPOINT [ "/home/app/main.sh" ]
