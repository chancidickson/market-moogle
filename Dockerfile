FROM node:16-alpine AS builder
WORKDIR /home/node
VOLUME /home/node/node_modules

ADD scripts /home/node/scripts
ADD source /home/node/source
ADD views /home/node/views
COPY package.json /home/node
COPY package-lock.json /home/node
COPY tsconfig.json /home/node

RUN npm install
RUN npm run prod:build


FROM node:16-alpine
WORKDIR /home/node
EXPOSE 3000

COPY --from=builder /home/node/views ./views
COPY --from=builder /home/node/package.json ./
COPY --from=builder /home/node/server.out.js ./

CMD ["npm", "run", "prod:server"]
