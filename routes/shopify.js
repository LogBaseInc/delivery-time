var express = require('express');
var router = express.Router();
var shopifyAPI = require('shopify-node-api');
var Firebase = require('firebase');
var request = require('request');
var Trello = require("node-trello");
require("datejs");

var shopify_api_key = process.env.SHOPIFY_API_KEY;
var shopify_shared_secret = process.env.SHOPIFY_SHARED_SECRET;
var redirect_uri = process.env.REDIRECT_URI;
var access_token = process.env.ACCESS_TOKEN;
var shopify_scope = 'read_products,read_orders,write_orders,read_script_tags,write_script_tags,read_fulfillments,write_fulfillments';
var trello_key = process.env.TRELLO_KEY;
var trello_token = process.env.TRELLO_TOKEN;
var trello = new Trello(trello_key, trello_token);

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
    updateNewOrders();
    res.sendStatus(200);
});

router.get("/test", function (req, res) {
    updateNewOrders();
    res.sendStatus(200);
});

router.get("/orders", function(req, res) {
    var d = Date.today().addDays(-7);
    d = d.toString("yyyy-MM-dd HH:mm:ss");
    console.log(d);
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
        res.send(200).end;
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
    console.log(successMsg);
};

var trelloError = function(errorMsg) {
    console.log("Error: " + errorMsg);
};

function getDateFromNotes(notes) {
    var tokens = notes.split("|");
    var day = tokens[1];
    var timeSlot = tokens[2];
    var hour = 0;
    var mins = 0;

    if (timeSlot.indexOf("11:45") >= 0) {
        hour = 23;
        mins = 45;
    } else if (timeSlot.indexOf("pm") >= 0) {
        hour = parseInt(timeSlot);
        if (hour != 12) {
            hour+=12;
        }
    } else {
        hour = parseInt(timeSlot);
    }
    var dt = Date.parse(day);
    dt.setHours(hour, mins);
    dt.setTimezone("IST");
    return dt;
}

function trelloHashCode(s){
    return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
}

function updateNewOrders() {
    var idList = [];

    // Fetch existing order id's from trello
    trello.get("/1/boards/566563896dbd75a026943a18/cards",
        {
            fields: "name,id"
        },
        function(err, data) {
            if (err) throw err;
            for (var idx in data) {
                var fields = data[idx];
                if (fields != undefined && fields != null) {
                    var name = fields['name'];
                    if (name != null && name != undefined && name.indexOf('#') >= 0) {
                        var content = {
                            orderId : name.split("|")[0],
                            id: fields['id'],
                            checksum: name.split("|")[2]
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
    var tomo = getIST(Date.today().addDays(1));
    for (var index in orders) {
        var order = orders[index];
        var notes = order['note'];
        if (notes == "" || notes == null || notes == undefined) {
            // Alarm to be added
        } else {
            var dt = getDateFromNotes(notes);
            if (((dt.getDate() == today.getDate() && dt.getMonth() == today.getMonth()) ||
                 (dt.getDate() == tomo.getDate() && dt.getMonth() == tomo.getMonth())) &&
                notes.indexOf("Coimbatore") >= 0) {
                selectedOrders.push(order);
            }
        }
    }
    return selectedOrders;
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
            var message = null;
            var messageDesc = "";
            var prop = item['properties'];
            if (prop != null && prop != undefined) {
                for (var i in prop) {
                    if (prop[i].toString().indexOf("Message") >= 0) {
                        message = prop[i]['value'];
                        message = message.replace("\n", "");
                        message = message.replace("\r", "");
                    }

                    if (prop[i].toString().indexOf("Egg/Eggless") >= 0) {
                        eggOptions = " // " + prop[i]['value'];
                    }
                }
            }

            if (message != null && message != undefined) {
                messageDesc = "\tMESSAGE ON THE CAKE: " + message + "\n";
            } else {
                messageDesc = "\tMESSAGE ON THE CAKE: " + "\n";
            }

            itemDesc += "\t" + itemName + eggOptions + " (SKU : " + sku +")" + "\n" + messageDesc + "\n";

        }

        if (items.length > 1) {
            var name = order['name'] + " | " + "Multiple items in the order";
        } else {
            var name = order['name'] + " | " + itemsName + eggOptions;
        }

        // construct the description
        var itms = "ITEMS:\n" + itemDesc + "\n";
        var notes = "NOTES: \n" + "\t" + order['note'] + '\n\n';
        var address = "ADDRESS:" + "\n" +
            "\t" + order['shipping_address']['first_name'] + " " + order['shipping_address']['last_name'] + "\n" +
            "\t" + order['shipping_address']['address1'] + "\n" +
            "\t" + order['shipping_address']['address2'] + "\n" +
            "\t" + order['shipping_address']['city'] + "\n" +
            "\t" + order['shipping_address']['zip'] + "\n" +
            "\t" + order['shipping_address']['phone'] + "\n";
        var desc = itms + notes + address;
        var dueDate = (getDateFromNotes(notes));
        var newCard =
        {
            name: name + " | " + trelloHashCode(desc),
            desc: desc,
            pos: "top",
            due: dueDate,
            idList: "566563bd1cc575d849c316e7"
        };

        if (isOrderAbsentInTrello(order, existingOrdersIdsTrello)) {
            trello.post("/1/cards/", newCard, trelloSuccess, trelloError);
            //console.log("Posting an order to Trello");
        } else {
            //console.log("Testing updated orders");
            if (isShopifyOrderUpdated(order, desc, existingOrdersIdsTrello)) {
                var baseUrl = "/1/cards/" + getCardId(order, existingOrdersIdsTrello);
                trello.put(baseUrl + "/desc", { value: desc }, trelloSuccess, trelloError);
                trello.put(baseUrl + "/due", { value: dueDate } , trelloSuccess, trelloError);
                trello.put(baseUrl + "/name", { value: name + " | " + trelloHashCode(desc) }, trelloSuccess, trelloError);
                //console.log("Shopify order updated");
            }
        }
    }
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
    console.log(date, ISTTime)
    return ISTTime;
}