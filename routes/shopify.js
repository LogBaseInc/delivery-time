var express = require('express');
var router = express.Router();

// define the home page route
router.get('/:shop', function(req, res) {
	var shop = req.params.shop;
    
    //Do something

    console.log('Got request from shop: ' + shop);
    res.status(200).end();

});

router.get('/oauth/callback/', function(req, res) {
	var code = req.query.code;
	var hmac = req.query.hmac;
	var timestamp = req.query.timestamp;
	var state = req.query.state;
	var shop = req.query.shop;

    //Do something - Get permanent access token
    console.log('Got code: ' + code);
    res.status(200).end();
});

module.exports = router;


// Functions