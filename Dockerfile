FROM    node:0.12

# Bundle app source
ADD . /src
# Install app dependencies
RUN cd /src; npm install

EXPOSE  9000
CMD ["node", "/src/app.js"]