FROM node:latest

USER node

COPY index.js /home/node
COPY package.json /home/node

RUN cd /home/node && \
    npm install

ENTRYPOINT ["node", "/home/node"]
