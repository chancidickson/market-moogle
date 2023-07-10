FROM node:16-alpine

WORKDIR /home/node

ADD scripts /home/node/scripts
ADD views /home/node/views
COPY package.json /home/node
COPY package-lock.json /home/node
COPY server.js /home/node

RUN npm install

EXPOSE 3000

CMD npm start
