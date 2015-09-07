FROM    node:latest

# Bundle app source
ADD . /src
# Install app dependencies
RUN cd /src; npm install

EXPOSE  9000
CMD ["node", "/src/app.js"]