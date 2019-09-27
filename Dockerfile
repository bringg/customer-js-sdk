FROM node:10-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends bzip2 git libfontconfig \
    && npm install -g bower grunt-cli
