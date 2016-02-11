var express = require('express');
var router = express.Router();
var shopifyAPI = require('shopify-node-api');
var Firebase = require('firebase');
var request = require('request');
var Trello = require("node-trello");
var sendgrid  = require('sendgrid')(process.env.SENDGRID_KEY);
var Keen = require("keen-js");
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
            data: data,
            dates: dates
        }
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

router.get("/test", function (req, res) {
    //updateNonReviewedOrders();
    res.sendStatus(200);
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
        if (dt != null &&
            ((dt.getDate() == today.getDate() && dt.getMonth() == today.getMonth()) ||
                (dt.getDate() == tomo.getDate() && dt.getMonth() == tomo.getMonth())) &&
            notes.indexOf("Coimbatore") >= 0) {
            client.log({"orderId" : order.name}, ["shopify-update", "webhook"]);
            updateStick(order, true);
        }
    }
    res.status(200).end();
})

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
    var d = Date.today().addDays(-20); //All orders for last 20 days
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
        url: 'https://cake-bee.myshopify.com/admin/orders.json?limit=250&status=any&page='+count,
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            res.send(info);
            for (var i in info.orders) {
                var order = info.orders[i];
                var pasedOrder = parseorder(order);
                updateKeen(pasedOrder);
            }
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

    if (order != null && order.notes != null) {
        var orderId = parseInt(order.notes.split("**")[1]);
        console.log("Order id " + orderId);
    }

    if (activity == "PICKEDUP") {
        client.log(order, [activity, "eventslistener", "fulfill"])
        fulfillOrders(orderId, res);
    } else {
        res.status(200).end();
    }
});

function parseorder(order) {
    var parsedOrder = {}
    parsedOrder.order = order;
    if (order.note != null && order.note != undefined) {
        var deiveryDate = getDateFromNotes(order.note, false);
        if (deiveryDate != null) {
            parsedOrder.Deliverydate = deiveryDate.toString("yyyy/MM/dd");
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
    var d = Date.today().addDays(-7);
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
        var ispm = false;

        if(parseInt(timesplit[0]) == 10 && parseInt(timesplit[1]) == 1) {
            timeslot = '11:00';
        }
        else if(parseInt(timesplit[0]) == 4 && parseInt(timesplit[1]) == 7) {
            timeslot = '15:00';
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
    }else if (timeSlot.indexOf("pm") >= 0) {
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
        url: 'https://cake-bee.myshopify.com/admin/orders.json',
        headers: {
            'X-Shopify-Access-Token': access_token
        }
    };

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            var orders = info['orders'];
            var selectedOrders = selectOrdersForTrello(orders);
            updateTrello(selectedOrders, trelloExistingIdList)
        }
    }
    request(options, callback);
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
                        message = message.replace(/\n/g, "");
                        message = message.replace(/\r/g, "");
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

        //updateStick(order, true);
        //postToStick(getStickOrderDetails(order));
        //console.log(stickOrderDetails);
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
                updateStick(info.orders[idx], false);
            }
        }
    }
    request(options, callback);
}

function postToStick(stickOrderDetails) {
    var options = {
        url: 'http://stick-write-dev.logbase.io/api/orders/'+ stickToken,
        method: "POST",
        headers: {
            'Content-Type' : 'application/json'
        },
        json: true,
        body : stickOrderDetails
    };

    function callback(error, response, body) {
        //console.log(response.statusCode);
        // Need to handle cases when post fails
    }

    request(options, callback);
}

function deleteFromStick(order, date, update) {
    var orderId = order.name.replace("#","");
    var options = {
        url: 'http://stick-write-dev.logbase.io/api/orders/'+ stickToken,
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
        if (update == true) {
            order.deleteCount--;
            if (order.deleteCount == 0 && update == true) {
                postToStick(getStickOrderDetails(order))
            }
        }
    }

    request(options, callback);
}


function updateStick(order, update) {
    order['deleteCount'] = 0;
    order.deleteCount++;
    var d = Date.today().toString("yyyy/MM/dd");
    deleteFromStick(order, d, update);

    order.deleteCount++;
    d = Date.today().addDays(-1).toString("yyyy/MM/dd");
    deleteFromStick(order, d, update);

    order.deleteCount++;
    d = Date.today().addDays(1).toString("yyyy/MM/dd");
    deleteFromStick(order, d, update);
}

function getStickOrderDetails(order) {

    var shipping_address = order.shipping_address;
    var address = "";
    var mobile;
    var name = null;
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
            address += ", " + shipping_address.zip;
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
        order.gateway.indexOf('Cash on Delivery') >=0)) ? true: false;
    var cod = (iscod == true) ? order.total_price : 0;
    var tags = order.tags;

    if (tags != "") {
        tags += ", ";
    }

    var amount = 0;

    if (iscod) {
        amount = parseInt(order.total_price)
        tags += "UNPAID";
    } else {
        tags += "PAID";
    }

    var stickOrderDetails = {
        "order_id" : order.name.replace("#",""),
        "name" : name || order.customer.first_name,
        "address" : address,
        "delivery_date" : dueDate.toString("yyyy/MM/dd"),
        "mobile_number" : mobile,
        "delivery_start_time": dueDate.getHours(),
        "delivery_end_time": dueDate.getHours() + 1,
        "cod_amount": amount,
        "product_name": "",
        "product_desc": itemDesc,
        "notes": time_slt + "  \nOrdered by - " + billing_details + formatted_notes + "\n ** " + order.id,
        "tags" : tags,
        "url" : "https://cake-bee.myshopify.com/admin/orders/" + order.id
    }

    //console.log(stickOrderDetails);
    return stickOrderDetails;
}

function fulfillOrders(orderId, res) {
    console.log("Fulfillfing order " + orderId);
    var options = {
        url: 'https://cake-bee.myshopify.com//admin/orders/'+orderId+'/fulfillments.json',
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

function updateKeen(parsedOrder) {
    keenClient.addEvent("Order", parsedOrder, function(err, res){
        if (err) {
            console.log(err);
        }
        else {
            console.log(res);
        }
    });
}

function sortCards() {
    // New orders, Prepared & Reviewed
    var lists = ["56640605440193b69caaf4c2", "5664061695c72afb26e8cab4", "5664060eb9666dc526222224"]
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