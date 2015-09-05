var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var port = process.env.API_PORT || 9000;

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(bodyParser.json()); // for parsing application/json

//Routes
var shopify = require('./routes/shopify');
app.use('/shopify/', shopify);

app.listen(port);
console.log('Stick Read API is listening on port: ' + port);