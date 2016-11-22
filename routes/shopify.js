var express = require('express');
var router = express.Router();
var shopifyAPI = require('shopify-node-api');
var Firebase = require('firebase');
var request = require('request');
var Trello = require("node-trello");
var sendgrid  = require('sendgrid')(process.env.SENDGRID_KEY);
var Keen = require("keen-js");

var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var dynamodb = new AWS.DynamoDB({apiVersion: 'latest'});

var MSG91_API = process.env.MSG91_API;
var MSG91_ROUTE_NO = 4; // transactional route
var msg91 = require("msg91")(MSG91_API, "CKEBEE", MSG91_ROUTE_NO);

require("datejs");

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN;
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["Shopify", "CakeBee"],
    json:true
});

var stickToken = process.env.STICK_TOKEN;
var stickADToken = process.env.STICK_AD_TOKEN;
var stickTrichyToken = process.env.STICK_TRICHY_TOKEN;
var shopify_api_key = process.env.SHOPIFY_API_KEY;
var shopify_shared_secret = process.env.SHOPIFY_SHARED_SECRET;
var redirect_uri = process.env.REDIRECT_URI;
var access_token = process.env.ACCESS_TOKEN;
var shopify_scope = 'read_products,read_orders,write_orders,read_script_tags,write_script_tags,read_fulfillments,write_fulfillments';
var trello_key = process.env.TRELLO_KEY;
var trello_token = process.env.TRELLO_TOKEN;
var trello = new Trello(trello_key, trello_token);
var keen_write_api_key = process.env.KEEN_WRITE_API_KEY;
var keen_project_id = process.env.KEEN_PROJECT_ID;

var keenClient = new Keen({
    projectId: keen_project_id,
    writeKey: keen_write_api_key
});

router.get("/dates", function(req, res) {
    var my_firebase_ref = new Firebase("https://lb-date-picker.firebaseio.com/");
    my_firebase_ref.once("value", function(snapshot) {
        data = snapshot.exportVal();

        var dates = {};

        var maxDays = data.config.maxDaysLimitForOrders;
        console.log(maxDays);
        var dayCount = 0
        while (dayCount < maxDays) {
            var d = Date.today().addDays(dayCount);
            dates[d.toString("yyyy MM dd")] = d.toString("dddd  MMM  dd, yyyy");
            dayCount++;
        }

        var response = {
            data: {
                coimbatore : data.coimbatore,
                config : data.config,
                trichy : data.trichy
            },
            dates: dates
        };
        res.send(response);
    });
});

router.get("/synctrello", function (req, res) {
    client.log({"event" : "synctrello"});
    sortCards();
    updateNewOrders();
    archieveOFDOrders();
    res.sendStatus(200);
});

router.get("/reviewreminder", function(req, res) {
    client.log({"event" : "reviewreminder"});
    updateNonReviewedOrders();
    res.sendStatus(200);
});

router.get("/daysummary/:date", function (req, res) {
    fetchProducts(req.params.date.replace(/-/g, '/'), null,
        {
            coimbatore : {
                count : 0,
                payu : 0,
                payu_final : 0,
                ad : 0,
                cod : 0,
                cancelled : 0,
                ad_breakup : {
                    cod : 0,
                    payu : 0,
                    payu_final : 0
                }
            } ,
            trichy : {
                count :  0,
                payu : 0,
                payu_final : 0,
                cod: 0,
                cancelled : 0
            }}, res);
});

router.post("/webhook", function(req, res) {
    var today = getIST(Date.today());
    var tomo = getIST(Date.today().addDays(1));
    var order = req.body;
    var notes = order['note'];
    client.log({"orderId" : req.body.name, "notes": notes},  ["webhook"]);
    if (notes == "" || notes == null || notes == undefined) {
        // Send an alarm that notes are missing
        sendNotesMissingEmail("coimbatore@cakebee.in", order);
        sendNotesMissingEmail("kousik@logbase.io", order);
    } else {
        var dt = getDateFromNotes(notes, true);

        if (dt == null) {
            sendEmail("kousik@logbase.io", order,
                    "Error while processing date in order " + order.name,
                    'https://cake-bee.myshopify.com/admin/orders/' + order.id);
        }

        if (dt != null) {
            client.log({"orderId" : order.name}, ["shopify-update", "webhook"]);
            if  (order.cancelled_at == null) {
                updateStick(order, true);
                updateDynamoDB([order]);
            } else {
                client.log({"orderId" : req.body.name, "notes": notes}, ["webhook", "cancelled_update"]);
                updateKeen(order);
                updateStick(order, false);
                updateDynamoDB([order]);
            }
        }
    }
    res.status(200).end();
});

router.post("/neworderwebhook", function(req, res) {
    var order = req.body;
    var notes = order['note'];
    client.log({"orderId" : req.body.name, "notes": notes},  ["webhook", "New Order"]);
    if (notes == "" || notes == null || notes == undefined) {
        // Send an alarm that notes are missing
        sendNotesMissingEmail("coimbatore@cakebee.in", order);
        sendNotesMissingEmail("kousik@logbase.io", order);
    }
    sendNewOrderNotification(order);
    var dt = getDateFromNotes(notes, true);

    if (dt == null) {
        sendEmail("kousik@logbase.io", order,
                "Error while processing date in order " + order.name,
                'https://cake-bee.myshopify.com/admin/orders/' + order.id);
        sendEmail("abishek@logbase.io", order,
                "Error while processing date in order " + order.name,
                'https://cake-bee.myshopify.com/admin/orders/' + order.id);
    }

    sendOrderConfirmationSms(order);

    if (dt != null) {
       updateStick(order, true);
       updateDynamoDB([order]);
    }
    res.status(200).end();
});

router.post("/fulfillwebhook", function(req, res){
    var order = req.body;
    var notes = order['note'];
    client.log({"orderId" : req.body.name, "notes": notes}, ["webhook", "fulfilled"]);
    updateKeen(order);
    removeOrderIdFromFB(order.id);
    sendShipmentSms(order);
    updateDynamoDB([order]);
    res.status(200).end();
});

router.post("/cancelledwebhook", function(req, res) {
    var order = req.body;
    var notes = order['note'];
    client.log({"orderId" : req.body.name, "notes": notes}, ["webhook", "cancelled"]);
    updateKeen(order);
    updateStick(order, false);
    sendOrderCancellationSms(order);
    updateDynamoDB([order]);
});
router.get("/trellocleanup", function (req, res) {
    client.log({"event" : "trellocleanup"});
    var testIds = ["567e9dc1f840b25378313953"];
    var ids = ["568282740d26463b4f8b010f", "568282863e3ddec5e947e13a"];
    for (var id in testIds) {
        var url = "/1/lists/" + testIds[id] + "/archiveAllCards";
        trello.post(url, null, trelloSuccess, trelloError);
    }
    res.sendStatus(200);
});

router.get("/test", function(req, res) {
    res.status(200).send();
});
router.get("/order/fulfill/:orderid", function (req, res) {
    fulfillOrders(req.params.orderid, res);
});

router.get("/order/makepayment/:orderid", function (req, res) {
    var options = {
        url: 'https://cake-bee.myshopify.com//admin/orders/'+req.params.orderid+'/transactions.json',
        method: "POST",
        headers: {
            'X-Shopify-Access-Token': access_token,
            'Content-Type' : 'application/json'
        },
        json: true,
        body : {"transaction": {"kind": "capture"}}
    };

    function callback(error, response, body) {
       if (!error && (response != null && response != undefined && (response.statusCode == 201 || response.statusCode == 422))) {
            //201 means fullfilled and 422 means already fullfilled
            res.sendStatus(200);
       }
    }
    request(options, callback);
});

router.get("/orders", function(req, res) {
    var d = Date.today().addDays(-5); //All orders for last 5 days
    d = d.toString("yyyy-MM-dd HH:mm:ss");
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=250&status=any&created_at_min='+d+' IST',
        headers: {
            'X-Shopify-Access-Token': access_token
          }
    };

    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        res.send(info);
      }
    }
    request(options, callback);
});

router.get("/updatekeenio/:count", function(req, res) {
    var count = req.params.count;
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=25&status=any&page='+count,
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            res.status(200).send({ count : info.orders.length });
            for (var i in info.orders) {
                var order = info.orders[i];
                if (order.fulfillment_status == "fulfilled" || order.cancelled_at != null) {
                    //updateKeen(order);
                }
            }
            updateDynamoDB(info.orders);
        }
    }

    request(options, callback);
});

router.post("/events/listener", function(req, res){
    var order = req.body.order;
    var activity = req.body.activity;
    var time_ms = req.body.time_ms;
    var token = req.body.token;

    client.log(order, [activity, "eventslistener"])

    if (token != stickToken) {
        res.status(400).send("Invalid Token");
        return;
    }

    if (order != null && order.ordernumber != null && order.ordernumber.indexOf("CB") < 0) {
        res.status(200).send();
        return;
    }
    if (order != null && order.notes != null) {
        var orderId = parseInt(order.notes.split("**")[1]);
        console.log("Order id " + orderId);
    }

    if (activity == "PICKEDUP" || "DELIVERED") {
        client.log(order, [activity, "eventslistener", "fulfill"])
        fulfillOrders(orderId, res);
    } else {
        res.status(200).send();
    }
});

function parseorder(order) {
    var parsedOrder = {}
    parsedOrder.order = order;
    if (order.note != null && order.note != undefined) {
        var deiveryDate = getDateFromNotes(order.note, false);
        if (deiveryDate != null) {
            parsedOrder.Deliverydate = deiveryDate.toString("yyyy/MM/dd");
            parsedOrder.ddate = deiveryDate.toString("dd");
            parsedOrder.dmonth = deiveryDate.toString("MM");
            parsedOrder.dyear = deiveryDate.toString("yyyy");
            parsedOrder.dday = deiveryDate.toString("ddd")
            parsedOrder.Deliverytime = " ";
            parsedOrder.DeliveryStartTime = deiveryDate.getHours();
            if (order.note.split('|').length >= 3) {
                parsedOrder.Deliverytime = order.note.split('|')[2];
            }
            parsedOrder.city = order.note.split('|')[0];
        }
    }
    var created_at_ = new Date(order.created_at);
    if (created_at_ != "Invalid Date") {
        parsedOrder.keen = {
            timestamp: (new Date(order.created_at)).toISOString()
        };
    }
    parsedOrder.cancelled = parsedOrder.order.cancelled_at == null ? false : true;
    parsedOrder.price = parseInt(order.total_price);
    return parsedOrder;
}

router.get("/oldopenorders", function(req, res) {
    var d = Date.today().addDays(-5); //From last 5 days
    d = d.toString("yyyy-MM-dd HH:mm:ss");
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=250&created_at_max='+d+' IST',
        headers: {
            'X-Shopify-Access-Token': access_token
          }
    };

    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        res.send(info);
      }
    }
    request(options, callback);
});

router.get("/availability", function(req, res) {
    res.sendFile(__dirname+'/availability/availability.html');
});

router.get("/summary", function(req, res) {
    res.sendFile(__dirname+'/ordersummary/orders.html');
});

router.get("/products", function(req, res) {
     var options = {
        url: 'https://cake-bee.myshopify.com/admin/products.json?limit=250',
        headers: {
            'X-Shopify-Access-Token': access_token
          }
    };

    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);
        res.send(info);
      }
    }
    request(options, callback);
});

router.get("/checkproducts", function(req, res) {
    res.sendFile(__dirname+'/productvalidation/productvalidation.html');
});

router.get("/cleanslot", function(req, res) {
    client.log({"event" : "cleanslot"});
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=250',
        headers: {
            'X-Shopify-Access-Token': access_token
          }
    };

    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
        var data = JSON.parse(body);
        
        var cbeslotArray = [];

        var trichyslotArray = [];

        for(var i=0; i< data.orders.length; i++) {
            var notesplit = data.orders[i].note != null ? data.orders[i].note.split('|'): [];
            if(notesplit.length>0 && notesplit[0].indexOf('Coimbatore') >= 0 ) {
                calculateSlotCount(notesplit, cbeslotArray);
            }
            else if(notesplit.length>0 && notesplit[0].indexOf('Trichy') >= 0 ) {
                calculateSlotCount(notesplit, trichyslotArray);
            }
         }

        var firebase_url = "https://lb-date-picker.firebaseio.com/";
        var cbe_firebase_ref = new Firebase(firebase_url + 'coimbatore');
        cbe_firebase_ref.set(cbeslotArray , function() {
            console.log("Coimbatore slots updated");
        });

        var trichy_firebase_ref = new Firebase(firebase_url + 'trichy');
        trichy_firebase_ref.set(trichyslotArray , function() {
            console.log("Trichy slots updated");
        });

       }

       res.send("Slots cleaned successfully");
    }
    request(options, callback);
});

function calculateSlotCount(notesplit, slotArray, dates) {
    var timeslot = "";
    if(notesplit.length >= 2) {
        var timesplit = notesplit[2].split('-');
        if(timesplit.length < 2)
            timesplit = notesplit[2].split('–');
        var ispm = false;

        if(parseInt(timesplit[0]) == 10 && parseInt(timesplit[1]) == 1) {
            timeslot = '12:30';
        }
        else if(parseInt(timesplit[0]) == 2 && parseInt(timesplit[1]) == 5) {
            timeslot = '04:30';
        }
        else if(parseInt(timesplit[0]) == 5 && parseInt(timesplit[1]) == 8) {
            timeslot = '07:30';
        }
        else {
            if(timesplit[1].toLowerCase().indexOf('pm') >=0 && parseInt(timesplit[0]) >= 1 && parseInt(timesplit[0]) <= 8) {
                ispm = true;
            }

            timeslot = (isNaN(parseInt(timesplit[0])) ? 24 : (ispm ? (parseInt(timesplit[0])+12) : parseInt(timesplit[0]))).toString()+":00"; 
        }
    }

    var date = new Date(notesplit[1]).toString("yyyyMMdd");
    if(slotArray[date] == undefined)
        slotArray[date] = {};

    if(slotArray[date][timeslot] == undefined) {
        slotArray[date][timeslot] = 1
    }
    else {
        slotArray[date][timeslot] = 1+ parseInt(slotArray[date][timeslot]);
    }
}

function removeOldOrders(fburl, city) {
    // remove old values
    var my_firebase_ref = new Firebase(fburl + city);
    my_firebase_ref.once("value", function(snapshot) {
        var dates = snapshot.exportVal();

        if (dates != null) {
            var d = Date.today().addDays(-1);
            var curDate = parseInt(d.toString("yyyyMMdd"));
            for (var key in dates) {
                if (parseInt(key) < curDate) {
                    dates[key] = null;
                }
            }
            my_firebase_ref.update(dates , function() {
                console.log("Date updated");
            });
        }
    });

}
router.get("/order", function(req, res) {
    var date = req.query.date;
    var city = req.query.city;
    var slot = req.query.slot;
    console.log(date, city, slot);
    var firebase_url = "https://lb-date-picker.firebaseio.com/";
    var my_firebase_ref = new Firebase(firebase_url + city + "/" + date);

    my_firebase_ref.once("value", function(snapshot) {
        slots = snapshot.exportVal();

        if (slots == null) {
            slots = {};
            var slotVal = 1;
        } else {
            slotVal = slots[slot];
            if (slotVal == null) {
                slotVal = 1;
            } else {
                slotVal++;
            }
        }

        slots[slot] = slotVal;

        console.log(slots);
        my_firebase_ref.update(slots , function() {
            console.log("Count updated");
        });
        removeOldOrders(firebase_url, city);
        res.status(200).end();
    }, function (err) {
        console.log(err);
        res.status(200).end;
    })

});

// define the home page route
router.get('/:shop', function(req, res) {
	var shop = req.params.shop;
    console.log('Got request from shop: ' + shop);

    //Do something
    var Shopify = new shopifyAPI({
        shop: shop, // MYSHOP.myshopify.com
        shopify_api_key: shopify_api_key, // Your API key
        shopify_shared_secret: shopify_shared_secret, // Your Shared Secret
        shopify_scope: shopify_scope,
        redirect_uri: redirect_uri
    });
    var auth_url = Shopify.buildAuthURL();
	res.redirect(auth_url);
});


router.get('/oauth/callback/', function(req, res) {
	var code = req.query.code;
	var shop = req.query.shop;
	console.log('Got code: ' + code + '|' + shop);

	/*
	var hmac = req.query.hmac;
	var timestamp = req.query.timestamp;
	var state = req.query.state;
	*/

	var query_params = req.query;
	var Shopify = new shopifyAPI({
        shop: shop, // MYSHOP.myshopify.com
        shopify_api_key: shopify_api_key, // Your API key
        shopify_shared_secret: shopify_shared_secret, // Your Shared Secret
        shopify_scope: shopify_scope,
        redirect_uri: redirect_uri
    });

    Shopify.exchange_temporary_token(query_params, function(err, data){
	    // This will return successful if the request was authentic from Shopify
	    // Otherwise err will be non-null.
	    // The module will automatically update your config with the new access token
	    // It is also available here as data['access_token']
	    if(err == null) {
	    	var access_token = data['access_token'];
	    	console.log('Got permanent token: ' + access_token);
	    	res.status(200).end();
	    } else {
	    	console.log('Could not exchange temp token');
	    	res.status(401).end();
	    }
	});
});

module.exports = router;


// Functions

var trelloSuccess = function(successMsg) {
    client.log(successMsg, "trellosuccess");
    console.log("Trello op success " + successMsg);
};

var trelloError = function(errorMsg) {
    client.log(errorMsg, "trellofailure");
    console.log("Error: " + errorMsg);
};

function getDateFromNotes(notes, ist) {
    var tokens = notes.split("|");
    var day = tokens[1];
    var timeSlot = tokens[2];
    var hour = 0;
    var mins = 0;
    var dt = null;

    if (day == null || day == undefined || timeSlot == null || timeSlot == undefined) {
        return dt;
    }

    if (timeSlot.indexOf("11:45") >= 0 || timeSlot.indexOf("11.45") >= 0) {
        hour = 23;
        mins = 45;
    } else if (timeSlot.indexOf("11") >= 0 && timeSlot.indexOf("12") >= 0 && timeSlot.indexOf("pm") >= 0) {
        hour = 11;
    } else if (timeSlot.indexOf("10") >= 0 && timeSlot.indexOf("1") >= 0 && timeSlot.indexOf("pm") >= 0) {
        hour = 10;
    } else if (timeSlot.indexOf("pm") >= 0) {
        hour = parseInt(timeSlot);
        if (hour != 12) {
            hour+=12;
        }
    } else {
        hour = parseInt(timeSlot);
    }
    var dt = Date.parse(day);

    if (dt == null || dt == undefined) {
        return null;
    }

    dt.setHours(hour, mins);
    if (ist == true) {
        dt.setTimezone("IST");
    }
    return dt;
}

function trelloHashCode(s){
    return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
}

function updateNewOrders() {
    var idList = [];

    // Fetch existing order id's from trello
    trello.get("/1/boards/566405f9a6394f7126c09439/cards",
        {
            fields: "name,id,due"
        },
        function(err, data) {
            if (err) throw err;
            for (var idx in data) {
                var fields = data[idx];
                if (fields != undefined && fields != null) {
                    var name = fields['name'];
                    if (name != null && name != undefined && name.indexOf('CB') >= 0) {
                        var content = {
                            orderId : name.split("|")[0],
                            id: fields['id'],
                            checksum: name.split("|")[2],
                            due: fields['due']
                        }
                        idList.push(content);
                    }
                }
            }
            processShopifyOrders(idList);
    });
}

/*
 * Fetch orders from shopify and update it to Trello
 */
function processShopifyOrders(trelloExistingIdList) {
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=250',
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            var orders = info['orders'];
            console.log(orders.length);
            var selectedOrders = selectOrdersForTrello(orders);
            updateTrello(selectedOrders, trelloExistingIdList)
        }
    }
    request(options, callback);

    /** Hack to fetch old orders **/

    var options1 = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?fulfillment_status=unshipped&limit=250&page=1',
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };
    request(options1, callback);

    var options2 = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?fulfillment_status=unshipped&limit=250&page=2',
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };
    request(options2, callback);

    var options3 = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?fulfillment_status=unshipped&limit=250&page=3',
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };
    request(options3, callback);

}

/*
 * We need to update current orders (today's & tomorrow's) to Trello
 * So pick orders which needs to be delivered today and tomorrow
 */
function selectOrdersForTrello(orders) {
    var selectedOrders = [];
    var today = getIST(Date.today());
    var test = getIST(new Date());
    if (test.getHours() >= 16) {
        console.log("TESTING - " + test);
        var tomo = getIST(Date.today().addDays(1));
    } else {
        var tomo = getIST(Date.today().addDays(0));
    }
    for (var index in orders) {
        var order = orders[index];
        var notes = order['note'];
        if (notes == "" || notes == null || notes == undefined) {
            // Send an alarm that notes are missing
            sendNotesMissingEmail("coimbatore@cakebee.in", order);
            sendNotesMissingEmail("kousik@logbase.io", order);
        } else {
            var dt = getDateFromNotes(notes, true);
            if (dt != null &&
                ((dt.getDate() == today.getDate() && dt.getMonth() == today.getMonth()) ||
                 (dt.getDate() == tomo.getDate() && dt.getMonth() == tomo.getMonth())) &&
                notes.indexOf("Coimbatore") >= 0) {
                selectedOrders.push(order);
            }
        }
    }
    return selectedOrders;
}

/*
 * Warn users about the missing notes
 */
function sendNotesMissingEmail(emailId, order) {
    var subject = 'Notes missing from order - ' + order['name'];
    var text = 'Notes are missing from the order - ' + "https://cake-bee.myshopify.com/admin/orders/" +
            order['id'] + ". Please take necessary action. \n";
    sendEmail(emailId, order, subject, text)
}


/*
 * Send notification mails
 */
function sendEmail(emailId, order, subject, text) {
    var payload   = {
        to      : emailId,
        from    : 'CakeBeeBot@cakebee.in',
        subject : subject,
        text    : text
    }

    sendgrid.send(payload, function(err, json) {
        if (err) { console.error(err); }
        console.log(json);
    });
}

/*
 * Warn admin about non reviewed orders in Trello
 */
function sendReviewEscalationEmail(emailId, order) {
    var subject = "Order - " + order['name'] + " not yet reviewed in Trello";
    var text = "Order - " + order['name'] + " needs to be reviewed in Trello. Please take necessary action. \n";
    sendEmail(emailId, order, subject, text);
}

/*
 * Trello needs to be updated in the following cases
 * 1. New orders
 * 2. If the existing order gets updated in Shopify. In this case, we can compare
 *    the checksum in the trello card and update the Trello card, if there is a change in the
 *    Shopify order.
 */
function updateTrello(orders, existingOrdersIdsTrello) {
    for (var index in orders) {
        var order = orders[index];
        var items = order['line_items'];
        var address = "";
        var isSignature = false;
        var freeSampler = "\t1 X Four Flavour Sampler\n";

        // construct the name
        var itemsName = "";
        var itemsSeparater = "";
        var itemDesc = "\n";
        for (var idx in items) {
            var item = items[idx];
            var sku = item['sku'];
            if (sku == null) {
                sku = "";
            }

            if (sku.indexOf("SG") >= 0) {
                //isSignature = true;
            }

            var itemName = item['quantity'] + " X " + item['name'];
            itemsName = itemsName + itemName + itemsSeparater;
            itemsSeparater = "  ----  ";

            var eggOptions = "";
            var flavours = "";
            var message = null;
            var messageDesc = "";
            var prop = item['properties'];
            if (prop != null && prop != undefined) {
                for (var i in prop) {
                    if (prop[i]['name'].toString().indexOf("Message") >= 0) {
                        message = prop[i]['value'];
                        message = message.replace(/\n/g, " ");
                        message = message.replace(/\r/g, " ");
                    }

                    if (prop[i]['name'].toString().indexOf("Egg/Eggless") >= 0) {
                        eggOptions = " / " + prop[i]['value'];
                    }

                    if (prop[i]['name'].toString().indexOf("Flavours") >= 0) {
                        flavours = " / " + prop[i]['value'];
                    }
                }
            }

            if (message != null && message != undefined) {
                messageDesc = "\tMESSAGE ON THE CAKE: " + message + "\n";
            } else {
                messageDesc = "\tMESSAGE ON THE CAKE: " + "\n";
            }

            itemDesc += "\t" + itemName + eggOptions + flavours + " (SKU : " + sku +")" + "\n" + messageDesc + "\n";

        }

        if (isSignature) {
            itemDesc += freeSampler;
        }

        if (items.length > 1) {
            var name = order['name'] + " | " + "Multiple items in the order";
        } else {
            var name = order['name'] + " | " + itemsName + eggOptions + flavours;
        }

        // construct the description
        var itms = "ITEMS:\n" + itemDesc + "\n";
        var notes = "NOTES: \n" + "\t" + order['note'] + '\n\n';
        if (order['shipping_address'] != null && order['shipping_address'] != undefined) {
            address = "ADDRESS:" + "\n" +
                "\t" + order['shipping_address']['first_name'] + " " + order['shipping_address']['last_name'] + "\n" +
                "\t" + order['shipping_address']['address1'] + "\n" +
                "\t" + order['shipping_address']['address2'] + "\n" +
                "\t" + order['shipping_address']['city'] + "\n" +
                "\t" + order['shipping_address']['zip'] + "\n" +
                "\t" + order['shipping_address']['phone'] + "\n";
        }

        var tags = "";

        if (order.tags != null) {
            tags = "\nTAGS: \n";
            tags += order.tags + "\n";
        }

        var desc = itms + notes + address + tags;
        var dueDate = (getDateFromNotes(notes, true));
        var newCard =
        {
            name: name + dueDate.toString(" ----- MMM dd -----") + " | " + trelloHashCode(desc),
            desc: desc,
            pos: "top",
            due: dueDate,
            idList: "56640605440193b69caaf4c2"
        };

        if (isOrderAbsentInTrello(order, existingOrdersIdsTrello)) {
            trello.post("/1/cards/", newCard, trelloSuccess, trelloError);
            updateStick(order, true);
            //console.log("Posting an order to Trello");
        } else {
            //console.log("Testing updated orders");
            if (isShopifyOrderUpdated(order, desc, existingOrdersIdsTrello)) {
                var baseUrl = "/1/cards/" + getCardId(order, existingOrdersIdsTrello);
                trello.put(baseUrl + "/desc", { value: desc }, trelloSuccess, trelloError);
                trello.put(baseUrl + "/due", { value: dueDate } , trelloSuccess, trelloError);
                trello.put(baseUrl + "/name", { value: name + " | " + trelloHashCode(desc) }, trelloSuccess, trelloError);
                updateStick(order, true);
                //console.log("Shopify order updated");
            }
        }

        var dtt = new Date();
        //console.log(order.name, dtt, dtt.getMinutes());
        if (dtt.getMinutes() < 3) {
            client.log({"event" : "stickupdate"});
            //updateStick(order, true);
        }
        //postToStick(getStickOrderDetails(order), stickToken);
        //console.log(getStickOrderDetails(order));
    }
    moveCancelledOrders(existingOrdersIdsTrello);
    removeDateChangedOrders(orders, existingOrdersIdsTrello);
}

function isOrderAbsentInTrello(order, existingOrdersIdsTrello) {
    for (var idx in existingOrdersIdsTrello) {
        var trelloOrders = existingOrdersIdsTrello[idx];
        if (trelloOrders['orderId'].indexOf(order['name']) >= 0) {
            return false;
        }
    }
    return true;
}

function removeDateChangedOrders(shopifyOrders, trelloOrders) {
    var shopifyOrderList = [];
    for (var idx in shopifyOrders) {
        shopifyOrderList.push(shopifyOrders[idx].name);
    }

    for (var idx in trelloOrders) {
        var due = new Date(trelloOrders[idx]['due']);
        var tomo = getIST(Date.today().addDays(1));
        if(shopifyOrderList.toString().indexOf(trelloOrders[idx]['orderId'].trim()) >= 0) {
            //console.log( { "Date" : due, "newDate" : newDue, "match" : due == newDue } , ["Dates", "Present"]);
        } else {
            if (due.getDate() >= tomo.getDate() ||
                due.getMonth() > tomo.getMonth() ||
                due.getFullYear() > tomo.getFullYear()) {
                client.log(
                    {
                        "dueDate" : due,
                        "tomo" : tomo,
                        "orderId" : trelloOrders[idx]['orderId'],
                        "cardId" : trelloOrders[idx]['id']
                    } , ["DateChange"]);
                closeOFDOrders([trelloOrders[idx]['id']]);
            }
        }
    }
}

function isShopifyOrderUpdated(order, desc, existingOrdersIdsTrello) {
    for (var idx in existingOrdersIdsTrello) {
        var trelloOrders = existingOrdersIdsTrello[idx];
        if (trelloOrders['orderId'].indexOf(order['name']) >= 0) {
            if (parseInt(trelloHashCode(desc)) == parseInt(trelloOrders['checksum'])) {
                return false;
            } else {
                return true;
            }
        }
    }
    return true;
}

function getCardId(order, existingOrdersIdsTrello) {
    for (var idx in existingOrdersIdsTrello) {
        var trelloOrders = existingOrdersIdsTrello[idx];
        if (trelloOrders['orderId'].indexOf(order['name']) >= 0) {
            return trelloOrders['id'];
        }
    }
}

function getIST(date) {
    var currentOffset = date.getTimezoneOffset();
    var ISTOffset = 330;   // IST offset UTC +5:30
    var ISTTime = new Date(date.getTime() + (ISTOffset + currentOffset)*60000);
    return ISTTime;
}


/*
 * Get out for delivery orders and archive old orders
 */
function archieveOFDOrders() {
    var idList = [];
    var cards = ["5664061695c72afb26e8cab4", "56b589c5eab1c2a87c205712"];

    // Fetch existing order id's from trello
    for (var idx in cards) {
        trello.get("/1/lists/" + cards[idx],
            {
                fields: "name,id",
                cards: "open",
                card_fields: "name,id,due"
            },
            function (err, data) {
                if (err) throw err;
                var cards = data['cards'];
                for (var idx in cards) {
                    var card = cards[idx];
                    var due = Date.parse(card['due']);
                    var today = getIST(new Date());
                    var yesterday = today.addDays(-1);
                    due.setHours(yesterday.getHours() - 1);
                    console.log(due, yesterday);
                    if (due <= yesterday) {
                        idList.push(card['id']);
                    }
                }
                closeOFDOrders(idList);
            });
    }
}

function closeOFDOrders(idList) {
    for (var idx in idList) {
        var baseUrl = "/1/cards/" + idList[idx];
        trello.put(baseUrl + "/closed", { value: true }, trelloSuccess, trelloError);
    }
}


function updateNonReviewedOrders() {
    var idList = [];
    //56640605440193b69caaf4c2
    trello.get("/1/lists/56640605440193b69caaf4c2",
        {
            fields: "name,id",
            cards: "open",
            card_fields: "name,id,badges,due"
        },
        function(err, data){
            if (err) throw err;
            var cards = data['cards'];
            for (var idx in cards) {
                var card = cards[idx];
                var due = Date.parse(card['due']);
                var today = getIST(new Date());
                if (due.getDate() == today.getDate()) {
                    var url = "/1/cards/" + card['id'] + "/actions/comments";
                    trello.post(url, { text : "Order not yet reviewed."}, trelloSuccess, trelloError);
                }

                if (card.badges.comments >= 4) {
                    var order = {
                        name: card['name'].split("|")[0]
                    }
                    sendReviewEscalationEmail("coimbatore@cakebee.in", order);
                    sendReviewEscalationEmail("kousik@logbase.io", order);
                }
            }
        });
}


function moveCancelledOrders(existingOrdersInTrello) {
    var d = Date.today().addDays(-10); //Cancelled orders for last 5 days
    d = d.toString("yyyy-MM-dd HH:mm:ss");
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=250&status=cancelled&created_at_min='+d+' IST',
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };

    function callback(error, response, body) {
        var idList = [];
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            for (var idx in info.orders) {
                var order = { name : info.orders[idx].name}
                if(!isOrderAbsentInTrello(order, existingOrdersInTrello)) {
                    closeOFDOrders([getCardId(order, existingOrdersInTrello)]);
                }
                //updateStick(info.orders[idx], false);
            }
        }
    }
    request(options, callback);
}

function postToStick(stickOrderDetails, token, orderId) {
    var options = {
        url: 'http://stick-write-dev.logbase.io/api/orders/'+ token,
        method: "POST",
        headers: {
            'Content-Type' : 'application/json'
        },
        json: true,
        body : stickOrderDetails
    };

    function callback(error, response, body) {
        client.log({ order: stickOrderDetails.order_id, response: response.statusCode, body: body}, ["postToStick"]);
        var order_detail_ref = new Firebase("https://lb-date-picker.firebaseio.com/stick");
        var orderdetail = {};
        orderdetail[orderId] = stickOrderDetails.delivery_date;
        order_detail_ref.update(orderdetail);
        //console.log(response.statusCode);
    }

    request(options, callback);
}

function deleteFromStick(order, date, update, token) {
    var orderId = order.name.replace("#","");
    var options = {
        url: 'http://stick-write-dev.logbase.io/api/orders/'+ token,
        method: "DELETE",
        headers: {
            'Content-Type' : 'application/json'
        },
        json: true,
        body : {
            order_id: orderId,
            delivery_date: date
        }
    };

    function callback(error, response, body) {
        client.log({ order: order.name, response: response.statusCode, body: body}, ["deleteFromStick"]);
        if (update == true) {
            postToStick(getStickOrderDetails(order), token, order.id);
        } else {
            removeOrderIdFromFB(order.id);
        }
        if (body != null && body.error != null && update != true) {
            if (body.error.indexOf('User is assigned to the order') >=0) {
                //sendEmail("coimbatore@cakebee.in", order,
                  //  "Error while deleting cancelled order " + order.name + " from stick", body.error);
                sendEmail("kousik@logbase.io", order,
                        "Error while deleting cancelled order " + order.name + " from stick", body.error);
            }
        }
    }

    request(options, callback);
    deleteItem(date, order);
}

function updateStick(order, update) {
    var  notes = order['note'];

    if (notes.indexOf("Coimbatore") >= 0) {
        updateStickInt(order, update, stickToken);
    } else if (notes.indexOf("Trichy") >= 0) {
        updateStickInt(order, update, stickTrichyToken);
    }
    if (order.tags.indexOf("AD") >= 0) {
        updateStickInt(order, update, stickADToken);
    } else {
        updateStickInt(order, false, stickADToken);
    }
}

function updateStickInt(order, update, token) {

    console.log("Got an update request for order " + order.name, update);
    var order_detail_ref = new Firebase("https://lb-date-picker.firebaseio.com/stick/" + order.id);

    order_detail_ref.once("value", function(snapshot) {
        var data = snapshot.exportVal();

        console.log(data, update, this.order.name);
        if (data == null || data == undefined) {
            if (update == true) {
                postToStick(getStickOrderDetails(this.order), this.token, this.order.id)
                updateDynamoDB([order]);
            }
        } else {
            var d = Date.today().toString(data);
            deleteFromStick(this.order, d, this.update, this.token);
        }
    }, { order : order, token : token, update : update});
}

function getStickOrderDetails(order) {

    var shipping_address = order.shipping_address;
    var address = "";
    var mobile;
    var name = null;
    var isSignature = false;
    var freeSampler = "\n1 X Four Flavour Sampler\n";
    var zip = " ";

    if (shipping_address != null && shipping_address != undefined) {
        if (shipping_address.name != null) {
            name = shipping_address.name;
        }
        if (shipping_address.address1 != null) {
            address = shipping_address.address1;
        }

        if (shipping_address.address2 != null) {
            address += ", " + shipping_address.address2;
        }

        if (shipping_address.city != null) {
            address += ", " + shipping_address.city;
        }

        if (shipping_address.zip != null) {
            zip = shipping_address.zip;
        }
        mobile = order.shipping_address.phone || "";
    } else {
        address = "Shipping address is missing";
        mobile = "";
    }

    var billing_address = order.billing_address;
    var billing_details = "";
    if (billing_address != null && billing_address != undefined) {
        if (billing_address.name != null && billing_address.name != undefined) {
            billing_details += billing_address.name;
        }

        if (billing_address.phone != null && billing_address.phone != undefined) {
            billing_details += " | " + billing_address.phone + "  \n\n";
        }

    }

    var dueDate = getDateFromNotes(order['note'], false);

    // Item details
    var items = order['line_items'];
    var itemDesc = "";
    for (var idx in items) {
        var item = items[idx];
        var itemName = item['quantity'] + " X " + item['name'];

        var eggOptions = "";
        var flavours = "";
        var message = null;
        var messageDesc = "";
        var prop = item['properties'];

        var sku = item['sku'];
        if (sku == null) {
            sku = "";
        }

        if (sku.indexOf("SG") >= 0) {
            //isSignature = true;
        }

        if (prop != null && prop != undefined) {
            for (var i in prop) {
                if (prop[i]['name'].toString().indexOf("Message") >= 0) {
                    message = prop[i]['value'];
                    message = message.replace("\n", "");
                    message = message.replace("\r", "");
                }

                if (prop[i]['name'].toString().indexOf("Egg/Eggless") >= 0) {
                    eggOptions = " / " + prop[i]['value'];
                }

                if (prop[i]['name'].toString().indexOf("Flavours") >= 0) {
                    flavours = " / " + prop[i]['value'];
                }
            }
        }

        if (message != null && message != undefined && message.length > 1) {
            messageDesc = "MESSAGE ON THE CAKE: " + message + "\n";
        }

        if (idx > 0) {
            itemDesc += "\n";
        }

        itemDesc += itemName + eggOptions + flavours + "\n" + messageDesc;

    }

    if (isSignature) {
        itemDesc += freeSampler;
    }

    // Specific notes while delivering
    var notes = order['note'];
    var tokns = notes.split("|");
    var formatted_notes = "";
    var time_slt = tokns[2];
    for (var idx in tokns) {
        if (idx > 3) {
            formatted_notes += " | ";
        }
        if (idx > 2) {
            formatted_notes += tokns[idx];
        }
    }

    // Amount to be collected from customer
    var iscod = (order.gateway != null && (order.gateway.indexOf('COD') >=0 ||
        order.gateway.indexOf('Cash on Delivery') >=0) && !(order.financial_status == "paid")) ? true: false;
    var cod = (iscod == true) ? order.total_price : 0;
    var tags = order.tags;

    var cod_internal = null;

    if (order.gateway != null && order.gateway.indexOf("Cash on Delivery") >= 0) {
        cod_internal = parseInt(order.total_price);
    }

    if (tags != "") {
        tags += ", ";
    }

    var amount = 0;

    if (iscod) {
        amount = parseInt(order.total_price);
        tags += "UNPAID";
    } else {
        tags += "PAID";
    }


    /*
     * Additional check to account for the 3 hour slot
     */
    var notesplit = order.note != null ? order.note.split('|'): [];
    var slot_time = 1;
    if(notesplit.length >= 2) {
        var timesplit = notesplit[2].split('-');
        if (timesplit.length < 2)
            timesplit = notesplit[2].split('–');

        if (timesplit.length >= 2) {

            if (parseInt(timesplit[0]) == 10 && parseInt(timesplit[1]) == 1) {
                slot_time = 3;
            }
            else if (parseInt(timesplit[0]) == 2 && parseInt(timesplit[1]) == 5) {
                slot_time = 3;
            }
            else if (parseInt(timesplit[0]) == 5 && parseInt(timesplit[1]) == 8) {
                slot_time = 3;
            }
        }
    }

    var stickOrderDetails = {
        "order_id" : order.name.replace("#",""),
        "name" : name || order.customer.first_name,
        "address" : address,
        "delivery_date" : dueDate.toString("yyyy/MM/dd"),
        "mobile_number" : mobile,
        "delivery_start_time": dueDate.getHours(),
        "delivery_end_time": dueDate.getHours() + slot_time,
        "cod_amount": amount,
        "product_name": "",
        "product_desc": itemDesc,
        "notes": time_slt + "  \nOrdered by - " + billing_details + formatted_notes + "\n ** " + order.id,
        "tags" : tags,
        "url" : "https://cake-bee.myshopify.com/admin/orders/" + order.id,
        "zip" : zip,
        "country" : "India",
        "cod_internal" : cod_internal
    };

    //console.log(stickOrderDetails);
    return stickOrderDetails;
}

function fulfillOrders(orderId, res) {
    console.log("Fulfillfing order " + orderId);
    var options = {
        url: 'https://cake-bee.myshopify.com/admin/orders/'+orderId+'/fulfillments.json',
        method: "POST",
        headers: {
            'X-Shopify-Access-Token': access_token,
            'Content-Type' : 'application/json'
        },
        json: true,
        body : {"fulfillment": {"tracking_number": null,"notify_customer": true }}
    };

    function callback(error, response, body) {
        if (!error && (response != null && response != undefined && (response.statusCode == 201 || response.statusCode == 422))) {
            //201 means fullfilled and 422 means already fullfilled
            res.sendStatus(200);
        }
    }
    request(options, callback);

}

function updateKeen(order) {
    var parsedOrder = parseorder(order);
    postToKeen("Order_v1", parsedOrder);

    var line_items = order.line_items;
    for (var idx in line_items) {
        var item = line_items[idx];
        item['order_id'] = parsedOrder.order.id;
        postToKeen("Items", item);
    }
}

function postToKeen(project, event) {
    keenClient.addEvent(project, event, function(err, res){
        if (err) {
            client.log(err, ['keenio', 'error']);
        }
        else {
            client.log(res, ['keenio']);
        }
    });

}

function sortCards() {
    // New orders, Prepared & Reviewed
    var lists = ["56640605440193b69caaf4c2", "5664061695c72afb26e8cab4", "582d530a39583159da71b58b", "56b589c5eab1c2a87c205712"]
    for (var i in lists) {
        trello.get("/1/lists/" +lists[i],
            {
                fields: "name,id",
                cards: "open",
                card_fields: "name,id,due,pos"
            },
            function (err, data) {
                if (err) throw err;
                var cards = data['cards'];
                cards.sort(function (a, b) {
                    var a1 = a.due;
                    var b1 = b.due;
                    return a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
                });
                for (var idx in cards) {
                    var baseUrl = "/1/cards/" + cards[idx]['id'];
                    var cardPos = parseInt(cards[idx]['pos']);
                    var idxPos = parseInt(idx) + 1;
                    if (cardPos != idxPos) {
                        trello.put(baseUrl + "/pos", { value: idxPos }, trelloSuccess, trelloError);
                    }
                    var due = Date.parse(cards[idx]['due']);
                }
            });
    }
}

function sendNewOrderNotification(order) {
    var items = order['line_items'];

    if (order.updated_at == order.created_at) {
        var text = "Hello CakeBee | Your Online Cake Shop,\n\n" +
            order.customer.first_name + " placed a new order with you\n\n\n\n" +
            "Order Note:\n\n" + order.note + "\n\n" +
            "Link to order:\n\n" + "https://cake-bee.myshopify.com/admin/orders/" + order.id +"\n\n";
        var subject = 'New Order ' + order.name + " placed by " + order.customer.first_name;
        sendEmail('coimbatore@cakebee.in', order, subject, text);
    }


    /*
     * Disabling photo cake notifications.
     */
    /*
    var cc = ['kousik@logbase.io'];

    if (order.note != null && order.note.indexOf("Trichy") >= 0) {
        cc.push('trichy@cakebee.in');
    } else {
        cc.push('coimbatore@cakebee.in');
    }

    for (var idx in items) {
        var item = items[idx];
        if (item['title'].indexOf("Photo Cakes") >= 0 ||
            item['title'].indexOf("photo") >= 0 ||
            item['title'].indexOf("Photo") >= 0) {
            var payload   = {
                to      : 'vijesh@lightstory.in',
                from    : 'customerdelight@cakebee.in',
                subject : 'Photo Cake Order - ' + order.name,
                text    : 'Photo Cake Order - https://cake-bee.myshopify.com/admin/orders/' + order.id,
                cc      : cc
            };

            sendgrid.send(payload, function(err, json) {
                if (err) { console.error(err); }
                console.log(json);
            });
        }
    }
    */
}

function removeOrderIdFromFB(orderId) {
    var order_detail_ref = new Firebase("https://lb-date-picker.firebaseio.com/stick");
    var orderdetail = {};
    orderdetail[orderId] = null;
    order_detail_ref.update(orderdetail);
    client.log({"OrderId" : orderId }, ['removeOrderIdFromFB']);
}


function sendSms(mob, text) {
    client.log({mob : mob, text : text}, ['MSG91', 'debug_info']);
    var mobNo = parseMobNumber(mob);
    if (mobNo == null) {
        client.log({mobile : mob, message : text}, ['MSG91']);
        sendEmail("kousik@logbase.io", null, "CakeBee - sms failed", text + " " + mob);
        return;
    }
    mobNo = '91' + mobNo;
    msg91.send(mobNo, text, function(err, response){
        console.log(err);
        console.log(response);
    });
}

function sendOrderConfirmationSms(order) {
    var userName = order.customer.first_name;
    var orderId = order.name.replace("#","");
    var price = order.total_price;
    var mob = order.billing_address.phone || " - ";
    var text = "Hi " + userName + ", We have received your Order " + orderId + " on CakeBee. Please check email for more details.";
    sendSms(mob, text);
}

function sendOrderCancellationSms(order) {
    var userName = order.customer.first_name;
    var orderId = order.name.replace("#","");
    var mob = order.billing_address.phone || " - ";
    var text = "Hi " + userName + ", Your Order " + orderId + " has been cancelled. Please check email for more details. \n- CakeBee";
    sendSms(mob, text);
}

function sendShipmentSms(order) {
    var userName = order.customer.first_name;
    var orderId = order.name.replace("#","");
    var mob = order.billing_address.phone || " - ";
    var text = "Hi " + userName + ", Your Order " + orderId + " is out for delivery. You will be receiving them soon. \n- CakeBee";
    sendSms(mob, text);
}

function parseMobNumber(mob) {

    console.log(mob);

    // Cases where two numbers are provided. Pick the first 10 - 12 digit mob number
    if (mob.length > 20) {
        var tmp = mob.match(/\d{10,12}/);
        if (tmp != null) {
            mob = tmp[0];
        }
    }

    // Pick only the numbers. Remove special characters
    var numb = mob.match(/\d/g);
    numb = numb.join("");

    // Remove leading zeroes
    numb = numb.replace(/^0+/, '');

    switch (numb.length) {
        case 10:
            return numb;
        case 11:
            if (numb.indexOf('0') == 0) {
                return numb.substr(1, 10);
            }
            return null;
        case 12:
            if (numb.indexOf('91') == 0) {
                return numb.substr(2, 10);
            }
            return null;
        default:
            return null;
    }
    return null;
}

function updateDynamoDB(list_order) {
    var metrics_list = [];
    for (var idx in list_order) {
        var order = list_order[idx];
        client.log({id : order.name}, ['dynamodb', 'update']);
        var metrics = {};
        if (order.note != null && order.note != undefined) {
            var deiveryDate = getDateFromNotes(order.note, false);
            if (deiveryDate != null) {
                metrics.sDeliveryDate = { S: deiveryDate.toString("yyyy/MM/dd") };
                metrics.sDeliveryDay = { S: deiveryDate.toString("dd") };
                metrics.sDeliveryMonth = { S: deiveryDate.toString("MM") };
                metrics.sDeliveryYear = { S: deiveryDate.toString("yyyy") };
                metrics.sDeliveryDayOfWeek = { S: deiveryDate.toString("ddd") };
                metrics.sDeliverytime = { S: " " };
                metrics.sDeliveryStartTime = { S: deiveryDate.getHours().toString() };
                if (order.note.split('|').length >= 3) {
                    metrics.sDeliverytime = { S: order.note.split('|')[2] };
                }
                metrics.sCity = { S: order.note.split('|')[0] };
            } else {
                return;
            }
        } else {
            return;
        }
        metrics.bCancelled = { BOOL: order.cancelled_at == null ? false : true };
        metrics.iPrice = { N: parseInt(order.total_price).toString() };
        metrics.iOrderId = { N: order.id.toString() };
        metrics.sCreatedAt = { S: order.created_at };
        metrics.sUpdatedAt = { S: order.updated_at };
        metrics.sNotes = { S: order.note || " " };
        metrics.sGateway = { S: order.gateway || " "};
        metrics.sSourceName = { S: order.source_name || " "};
        metrics.iSerialNumber = { N: parseInt(order.number).toString() };
        metrics.sFinancialStatus = { S: order.financial_status || " "};
        metrics.sTotalDiscount = { S: order.total_discounts || " "};
        metrics.sRefSite = { S: order.referring_site || " "};
        metrics.sRefSource = { S: order.source_name || " "};
        metrics.sFulfillmentStatus = { S: order.fulfillment_status || " "};
        metrics.sTags = { S: order.tags || " "};
        metrics.sBillingMobile = { S: order.billing_address ? order.billing_address.phone || " " : " "};
        metrics.sShippingMobile = { S: order.shipping_address ? order.shipping_address.phone || " " : " "};
        metrics.sCutomerName = { S: order.customer.first_name || " " };
        metrics.sCustomerEmail = { S: order.customer.email || " " };
        metrics.iOrderNumer = { N: parseInt(order.order_number).toString() };
        metrics.sOrderName = { S: order.name };
        metrics.sPartitionKey = { S: metrics.sDeliveryDate.S.toString() };
        metrics.iRangeKey = { N: metrics.iOrderId.N.toString() };

        var put_request = {
            Item: metrics
        };

        var list_items = {
            PutRequest: put_request
        };

        metrics_list.push(list_items);
        //console.log(metrics_list.length, idx);

        if (idx == list_order.length - 1) {
            batchWrite(metrics_list);
            metrics_list = [];
            return;
        }

        if (metrics_list.length == 25) {
            batchWrite(metrics_list);
            metrics_list = [];
        }
    }
}

function batchWrite(metrics_list) {
    var params = {};
    params['RequestItems'] = {};
    params.RequestItems['CAKEBEE-ORDERS'] = metrics_list;

    dynamodb.batchWriteItem(params, function(err, data) {
        if (err) {
            console.log(err);
            client.log(err, ['dynamodb', 'Error']);
        }
    });
}


function fetchProducts(date, prevResult, resp_data, res) {
    console.log(date);

    var attributes = ['bCancelled', 'iPrice', 'sCity', 'sDeliveryDate',
        'sFinancialStatus', 'sFulfillmentStatus', 'sGateway', 'sOrderName', 'sTags'];


    var params = {
        TableName: 'CAKEBEE-ORDERS',
        AttributesToGet: attributes,
        KeyConditions: {
            'sPartitionKey': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [
                    {
                        S: date
                    }
                ]
            }
        },
        ScanIndexForward: true,
        Select: 'SPECIFIC_ATTRIBUTES'
    };

    if (prevResult != null && prevResult['LastEvaluatedKey'] != null) {
        params['ExclusiveStartKey'] = prevResult['LastEvaluatedKey'];
    }

    dynamodb.query(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(400).send(err);
            return;
        }
        else {
            if (data != null && data.Items != null) {
                for (var idx in data.Items) {
                    var jsonData = parseDDBJson(data.Items[idx]);

                    if (jsonData.sCity === "Coimbatore ") {
                        resp_data.coimbatore.count += 1;

                        if (jsonData.bCancelled) {
                            resp_data.coimbatore.cancelled += 1;
                            continue;
                        }
                        if (jsonData.sGateway === "payu_in") {
                            resp_data.coimbatore.payu += jsonData.iPrice;
                            resp_data.coimbatore.payu_final += parseFloat(0.975 * jsonData.iPrice);
                        } else if (jsonData.sGateway.indexOf('COD') >= 0) {
                            resp_data.coimbatore.cod += jsonData.iPrice;
                        }

                        if (jsonData.sTags.indexOf('AD') >= 0) {
                            resp_data.coimbatore.ad += jsonData.iPrice;
                            if (jsonData.sGateway === "payu_in") {
                                resp_data.coimbatore.ad_breakup.payu += jsonData.iPrice;
                                resp_data.coimbatore.ad_breakup.payu_final += parseFloat(0.975 * jsonData.iPrice);
                            } else if (jsonData.sGateway.indexOf('COD') >= 0) {
                                resp_data.coimbatore.ad_breakup.cod += jsonData.iPrice;
                            }
                        }


                    } else if (jsonData.sCity == "Trichy ") {
                        resp_data.trichy.count += 1;

                        if (jsonData.bCancelled) {
                            resp_data.trichy.cancelled += 1;
                            continue;
                        }

                        if (jsonData.sGateway === "payu_in") {
                            resp_data.trichy.payu += jsonData.iPrice;
                            resp_data.trichy.payu_final += parseFloat(0.975 * jsonData.iPrice);
                        } else if (jsonData.sGateway.indexOf('COD') >= 0) {
                            resp_data.trichy.cod += jsonData.iPrice;
                        }
                    }
                }
            }

            if (data.LastEvaluatedKey == null) {
                res.status(200).send(resp_data);
                return;
            } else {
                fetchProducts(date, data, resp_data, res)
            }
        }
    });
}


function formatResponse(json) {
    var respJson = {};
    for (var keys in json) {
        if (keys == "inventory" || keys == "price") {
            respJson[keys] = parseFloat(json[keys]);
        } else {
            respJson[keys] = json[keys];
        }
    }
    return respJson;
}

function parseDDBJson(DDBJson) {
    var parsedJson = {};
    for (var keys in DDBJson) {
        var DDBValue = DDBJson[keys];
        var value = null;
        var name = Object.keys(DDBValue)[0]
        switch(name) {
            case 'S':
                value = DDBValue[name];
                break;
            case 'N':
                value = parseInt(DDBValue[name]);
                break;
            case 'BOOL':
                value = DDBValue[name];
            default:
                value = DDBValue[name];
        }
        parsedJson[keys] = value;
    }
    return parsedJson;
}

function deleteItem(date, order) {
    if (order.note != null && order.note != undefined) {
        var deliveryDate = getDateFromNotes(order.note, false);
        var curdate = null;
        if (deliveryDate != null) {
            curdate = deliveryDate.toString("yyyy/MM/dd");
        }
        if (curdate === date) {
            client.log({id : order.name, date : date}, ['dynamodb', 'dontdelete']);
            return;
        }
    }

    client.log({id : order.name, date : date}, ['dynamodb', 'delete']);
    var params = {
        Key: {
            sPartitionKey: {
                S : date
            },
            iRangeKey: {
                N : order.id.toString()
            }
        },
        TableName: 'CAKEBEE-ORDERS'
    };
    dynamodb.deleteItem(params, function(err, data) {
        if (err) client.log( { err: err,  stack : err.stack}, ['dynamodb', 'delete', 'error']);
        updateDynamoDB(order);
    });
}