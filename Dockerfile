FROM    node:0.12

# Bundle app source
ADD . /
# Install app dependencies
RUN npm install

EXPOSE  9000
CMD ["node", "app.js"]