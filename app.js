/*
var fs = require('fs');
var https = require('https');

var key = fs.readFileSync('./deliverytime-key.pem');
var cert = fs.readFileSync('./deliverytime-cert.pem')
var https_options = {
    key: key,
    cert: cert
};
*/
var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var port = process.env.PORT || 1337;

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.text());

//Serve static content
app.use(express.static('public'));

//Routes
var shopify = require('./routes/shopify');
app.use('/shopify/', shopify);


app.use(function(err, req, res, next) {
    console.log(err.stack);
    next();
});

process.on('uncaughtException', function(err)  {
    console.log("YYYYYYYYYYYYYYYYYYYYYYYYYYYYYY");
    console.log(err)
});

app.listen(port);
//server = https.createServer(https_options, app).listen(port);
console.log('Delivery Time API is listening on port: ' + port);