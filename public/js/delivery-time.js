var lbDatePicker = {};
var delivery = {
    date: 0,
    hour: 0,
    month: 0,
    year: 0
}

var shopifyDs = {
    cartJson: null,
    cakeVariant: null,
    cakeType: null,
    city: null,
    submitType: "update",
    productTitles: [],
    addons: false,
    addonsOnly: false,
    signature: false
}

// 20 seconds timeout
$.ajaxSetup({ timeout: 10000 });

function loadCityValues() {

    var city = {};

    if (shopifyDs['addonsOnly'] == true) {

        myCitySelect.find("option").remove();

        var addContent = "<br>We are sorry, <font style=\"color:#FF0000\">you cannot order a bouquet" +
            " separately.</font>" +
            " Please order it along with a " +
            "<a href=\"http://www.cakebee.in/collections\"> <b>cake.</b></a>";

        $('#lbdt-note').html(addContent);
    } else if (shopifyDs['cakeType'] == 'sampler' ||
        shopifyDs['addons'] == true) {
        city = {
            select: "Select city",
            coimbatore: "Coimbatore"
        }
    } else {
        city = {
            select: "Select city",
            coimbatore: "Coimbatore",
            trichy: "Trichy"
        }
    }
    myCitySelect.find("option").remove();

    $.each(city, function(val, text) {
        myCitySelect.append(
            $('<option></option>').val(val).html(text)
        );
    });
}

function getIST() {
    var currentTime = new Date();
    var currentOffset = currentTime.getTimezoneOffset();
    var ISTOffset = 330;   // IST offset UTC +5:30
    var ISTTime = new Date(currentTime.getTime() + (ISTOffset + currentOffset)*60000);
    return ISTTime;
    return ISTTime;
}

// Special handling for plum
function isPlumOrder() {
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'plum') {
        return true;
    }
    return false;
}

function updateFirstPossibleDeliveryDate() {

    if (lbDatePicker.data.config.defaultDateTimeChecks == false) {
        updateDefaultDeliveryDates();
        return;
    }

    var dayCount = 0;
    var istDate = getIST();
    var curDate = istDate.getDate();
    var curhour = istDate.getHours();
    var workStartTime = lbDatePicker.data.config.workStartTime;
    var workingHoursPerDay = lbDatePicker.data.config.workingHoursPerDay;
    var workStopTime = workStartTime + workingHoursPerDay;
    var prepTime = lbDatePicker.data.config.cakeTypes[shopifyDs['cakeType']].prepTime[shopifyDs['cakeVariant']];

    var workingHoursLeftForDay = workStopTime - curhour;
    if (workingHoursLeftForDay < 0) {
        workingHoursLeftForDay = 0;
    }

    while (prepTime > workingHoursLeftForDay) {
        prepTime = prepTime - workingHoursLeftForDay;
        dayCount++;
        /*
         * reset working hours from next day
         */
        workingHoursLeftForDay = workingHoursPerDay;
    }


    /*
     * Hack for sampler
     */
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'sampler') {
        dayCount+=1;
    }

    istDate.setDate(curDate + dayCount);
    delivery['date'] = istDate.getDate();
    delivery['month'] = istDate.getMonth() + 1;
    delivery['year'] = istDate.getFullYear();
    if (curhour > workStartTime && dayCount == 0) {
        delivery['hour'] = curhour + prepTime + 1;
    } else {
        delivery['hour'] = workStartTime + prepTime + 1;
    }

    /*
     * Hack for sampler
     */
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'sampler') {
        delivery['hour'] = 9;
    }
}

function checkForHoliday(dt) {
    var holiday = false;


    if ((shopifyDs['cakeType'] == 'signature' || shopifyDs['cakeType'] == 'handcrafted') &&
        (dt.indexOf("23") >=0 || dt.indexOf("2017 01 01")>=0 || dt.indexOf("31") >= 0)) {
        console.log(dt);
        return true;
    }


    if (lbDatePicker['data']['config']['enableSlotChecks'] == false) {
        return false;
    }

    if (checkForStockAvailability(dt) == false) {
        // stock not available. Return true
        return true;
    }

    $.each(lbDatePicker.data.config.holiday[shopifyDs['city']], function(val, text) {
        if (text.toString().indexOf(dt) >= 0) {
            holiday = true;
        }
    });

    /*
     * Hack for sampler
     */
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'sampler') {
        var maxLimitReached = checkForMaxOrders(dt);
        if (maxLimitReached) {
            return true;
        }
    }

    return holiday;
}

/*
 * A hack to do stock keeping
 */
function checkForStockAvailability(dt) {
    var outOfStockItems = lbDatePicker['data']['config']['outOfStock'][shopifyDs['city']];
    if (outOfStockItems == null || outOfStockItems == undefined) {
        return true;
    }

    var stockAvailable = true;
    $.each(shopifyDs['productTitles'], function(index, value) {
        var stockAvailableDate = outOfStockItems[value];
        if (stockAvailableDate != null && stockAvailableDate != undefined) {
            // key format - "yyyy mm dd"
            var tokens = dt.split(" ");
            var delYear = parseInt(tokens[0]);
            var delMonth = parseInt(tokens[1]);
            var delDate = parseInt(tokens[2]);

            tokens = stockAvailableDate.split(" ");
            var stockAvailYear = parseInt(tokens[0]);
            var stockAvailMonth = parseInt(tokens[1]);
            var stockAvailDate = parseInt(tokens[2]);

            if (delYear > stockAvailYear ||
                (delMonth > stockAvailMonth && delYear == stockAvailYear) ||
                (delDate >= stockAvailDate && delMonth == stockAvailMonth && delYear == stockAvailYear)) {
                stockAvailable = true;
            } else {
                stockAvailable = false;
                return;
            }
        }
    });
    return stockAvailable;
}
/*
 * Hack for sampler
 */
function checkForMaxOrders(dt) {
    var total = 0;
    var maxLimitReached = false;
    var slotMaxLimit = 0
    var idx = dt.split(" ").join("")
    var orders = lbDatePicker.data[shopifyDs['city']][idx];
    if (orders == null || orders == undefined) {
        return false;
    }

    $.each(orders, function(val, text){
        if (val == "11:00" || val == "15:00") {
            var curOrder = parseInt(text);
            if (curOrder >= lbDatePicker.data.config.maxSamplersPerSlot) {
                slotMaxLimit++;
            }
            total+=curOrder;
        }
    });

    if (total >= (lbDatePicker.data.config.maxSamplersPerSlot * 2) || slotMaxLimit >= 2) {
        maxLimitReached = true;
    }

    return maxLimitReached;
}

function getDates() {
    var dates = {};
    $.each(lbDatePicker.dates, function(val, text) {
        // key format - "yyyy mm dd"
        var tokens = val.split(" ");
        var year = tokens[0];
        var month = tokens[1];
        var date = tokens[2];

        if (!checkForHoliday(val)) {
            if ((parseInt(date) >= delivery['date'] && parseInt(month) == delivery['month'] && parseInt(year) == delivery['year']) ||
                (parseInt(month) > delivery['month'] && parseInt(year) == delivery['year']) ||
                parseInt(year) > delivery['year']) {
                var freeSlots = getFreeSlotsForTheDay(date, month, year);
                if (freeSlots != {}) {
                    dates[val] = text;
                }
            }
        }
    });
    // TODO - need to handle case where we don't have a free slot at all
    if (Object.keys(dates).length == 0) {
        deliverySlotsFullNotification();
    }
    return dates;
}

function getFreeSlotsForTheDay(date, month, year) {
    var slots = {};
    var slotDateFormat = year.toString() + month.toString() + date.toString();

    var maxOrderPerSlot = lbDatePicker.data.config.maxOrdersPerSlot;
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'sampler') {
        maxOrderPerSlot = lbDatePicker.data.config.maxSamplersPerSlot;
    }

    $.each(lbDatePicker.data.config.slots, function(val, text) {
        // Check if we have data available for the city
        var slotsForTheDay = lbDatePicker.data[shopifyDs['city']];
        if (slotsForTheDay != null && slotsForTheDay != undefined) {
            slotsForTheDay = slotsForTheDay[slotDateFormat]
        }

        if (slotsForTheDay == null || slotsForTheDay == undefined) {
            slots[val] = text
        } else {
            var existingOrders = slotsForTheDay[val];
            if (existingOrders == null ||
                existingOrders < maxOrderPerSlot ||
                (isPlumOrder() && existingOrders < lbDatePicker.data.config.maxPlumOrdersPerSlot)) {
                slots[val] = text
            }
        }
    });
    return slots;
}


function getSlots(selectedDate) {
    // date format - "yyyy mm dd"
    var tokens = selectedDate.split(" ");
    var year = tokens[0];
    var month = tokens[1];
    var date = tokens[2];
    var selDate = parseInt(date);

    if (lbDatePicker.data.config.enableSlotChecks) {
        slots = getFreeSlotsForTheDay(date, month, year);
    } else {
        slots = lbDatePicker.data.config.slots;
    }
    if (selDate == delivery['date']) {
        selectedSlots = {};
        $.each(slots, function(val, text) {
            if (parseInt(val) >= delivery['hour']) {
                selectedSlots[val] = text;
            }
        });
        return selectedSlots;
    } else {
        return slots;
    }
}

function updateCakeDs() {
    $.getJSON( 'cart.js', function( json ) {
        shopifyDs['cartJson'] = json;
        var types = [];
        var variants = [];
        var title = [];

        /*
         * Get type and variant
         */
        $.each(shopifyDs['cartJson']['items'], function(index, item) {
            type = item['product_type'];
            if (type != undefined && type != null) {
                types.push(type.toLowerCase());
            }

            prop = item['properties'];
            if (prop != null) {
                variant = item['properties']['Egg/Eggless'];
                if (variant != undefined && variant != null) {
                    variants.push(variant.toLowerCase());
                } else {
                    variant = item['variant_options'].toString();
                    variants.push(variant.toLowerCase());
                }
            } else {
                variant = item['variant_options'].toString();
                variants.push(variant.toLowerCase());
            }

            // pick the titles
            shopifyDs['productTitles'].push(item['product_title'].toString())
            title.push(item['title'].toString().toLowerCase());
        });

        if (variants.toString().indexOf("eggless") >= 0) {
            shopifyDs['cakeVariant'] = 'eggless';
        } else {
            shopifyDs['cakeVariant'] = 'egg';
        }

        if(types.toString().indexOf("sampler") >= 0) {
            shopifyDs['cakeType'] = 'sampler';
        } else if (types.toString().indexOf("handcrafted") >= 0) {
            shopifyDs['cakeType'] = 'handcrafted';
        } else if(types.toString().indexOf("signature") >= 0) {
            shopifyDs['signature'] = true;
            shopifyDs['cakeType'] = 'signature';
        } else if(types.toString().indexOf("add ons") >= 0) {
            shopifyDs['cakeType'] = 'signature';
        } else if(types.toString().indexOf("plum") >= 0) {
            shopifyDs['cakeType'] = 'plum';
        } else {
            if (title.toString().indexOf("2 kg") >=0 || title.toString().indexOf("2kg") >= 0) {
                shopifyDs['cakeType'] = 'xpress2kg';
            } else {
                shopifyDs['cakeType'] = 'xpress';
            }
        }

        if (types.toString().indexOf("add ons") >= 0) {
            shopifyDs['addons'] = true;
            if (shopifyDs['cartJson']['items'].length == 1) {
                shopifyDs['addonsOnly'] = true;
            }
        }

        loadCityValues();
        updateFirstPossibleDeliveryDate();
        noteToCustomer();
        hideDeliverySlotForSampler();
    });
}

function hideDeliverySlotForSampler() {
    var addContent = "";
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'sampler') {
        addContent = "For <b>Sampler cakes</b> only two delivery slots are available.";
    }

    if (shopifyDs['cakeType'] == 'sampler') {
        var content = "<br><b>Sampler Cakes</b> are available only for Coimbatore. " +
            "Our <b>Sampler Cakes</b> takes a day to deliver. " + addContent;
        $('#lbdt-note').html(content);
    }
}

function deliverySlotsFullNotification() {
    var addContent = "";
    if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'sampler') {
        addContent = "<br>All delivery slots for <b style=\"color:#FF0000\">Sampler Cakes are full</b>. " +
            "Please come back tomorrow to order <b>Sampler Cakes</b>. " + "In the mean time " +
            "you can order our <a href=\"http://www.cakebee.in/collections/bees-xpress\"><b>Xpress Cakes</b></a>."

        ga('send', {
            hitType: 'event',
            eventCategory: 'Date Picker',
            eventAction: 'Delivery Slots Full',
            eventLabel: 'Sampler cakes delivery slots full'
        });

    } else {
        addContent = "<br>We are sorry, <font style=\"color:#FF0000\">all delivery slots are " +
            "fully booked for this week!</font>" +
            " Please check back tomorrow or " +
            "<a href=\"http://www.cakebee.in/pages/get-in-touch\"> <b>Get in touch</b></a> with us."

        ga('send', {
            hitType: 'event',
            eventCategory: 'Date Picker',
            eventAction: 'Delivery Slots Full',
            eventLabel: 'All cakes delivery slots full'
        });
    }

    $('#lbdt-note').html(addContent);
}

function noteToCustomer() {
    /*
     * Note not required for xpress egg cakes
     */
    var content = "";
    if ((shopifyDs['cakeType'] == 'xpress' && shopifyDs['cakeVariant'] == 'egg') ||
        shopifyDs['addonsOnly'] == true || isPlumOrder()) {
        return;
    }

    var prepTime = null;
    if (shopifyDs['cakeType'] == 'signature' ||
        shopifyDs['cakeType'] == 'xpress' ||
        shopifyDs['cakeType'] == 'xpress2kg') {
        prepTime = "6 hours";
    } else {
        prepTime = "1 day";
    }

    var cakeName;
    if (shopifyDs['cakeType'] == 'xpress') {
        cakeName = "Eggless Xpress cakes"
    } else if(shopifyDs['cakeType'] == 'xpress2kg') {
        cakeName = "2 kg cakes";
    } else if(shopifyDs['cakeType'] == 'signature') {
        if (shopifyDs['addons'] == true && shopifyDs['signature'] == true) {
            cakeName = "bouquet & signature cakes";
        } else if (shopifyDs['addons'] == false) {
            cakeName = 'signature'
        } else {
            cakeName = 'bouquet'
        }
    } else {
        cakeName = shopifyDs['cakeType'] + " cakes";
    }

    if (shopifyDs['cakeType'] == 'xpress2kg') {
        content = "<br>Our <b>" + cakeName +
            " Cakes</b> takes " + prepTime + " to prepare. ";
    } else {
        content = "<br>Our <b><font style=\"text-transform: capitalize;\">" + cakeName +
            "</font></b> takes " + prepTime + " to deliver. ";
    }

    if (shopifyDs['cakeType'] != 'xpress' &&
        (shopifyDs['addons'] == false || shopifyDs['cakeType'] == 'handcrafted')) {
        content = content + "If you need the cakes to be delivered sooner, please choose our " +
        "<a href=\"http://www.cakebee.in/collections/bees-xpress\"><b>0.5/1 kg Xpress Cakes</b></a>.";
    } else if (shopifyDs['addons'] == true) {
        content += "Bouquet is only available in Coimbatore.";
    }

    $('#lbdt-note').html(content);

    /*
     * Google Analytics
     */
    $('#lbdt-note a').click(function(event) {
        ga('send', {
            hitType: 'event',
            eventCategory: 'Date Picker',
            eventAction: 'Cart To Xpress',
            eventLabel: 'Perhaps needed a cake sooner'
        });
    });
}

function getDefaultDates() {
    var dayFormat = {
        "Mon": "Monday",
        "Tue": "Tuesday",
        "Wed": "Wednesday",
        "Thu": "Thursday",
        "Fri": "Friday",
        "Sat": "Saturday",
        "Sun": "Sunday"
    };
    var days = 0;
    var dates = {};
    var curDate = new Date();
    curDate.setDate(curDate.getDate() + 1);
    while(days < 7) {
        var idx = curDate.getFullYear().toString() + " " +
            (curDate.getMonth() + 1).toString() + " " +
            curDate.getDate().toString();
        var dateString = curDate.toDateString();
        var day = dateString.split(" ")[0];
        dateString = dateString.replace(day, dayFormat[day]);
        dateString = dateString.replace(" " + curDate.getFullYear(), ", " + curDate.getFullYear());
        if ((shopifyDs['cakeType'] == 'signature' || shopifyDs['cakeType'] == 'handcrafted') &&
            (dateString.indexOf("2017 01 01") >=0 || dateString.indexOf("24")>=0 || dateString.indexOf("31") >= 0)) {
            // Do nothing
        } else {
            dates[idx] = dateString;
        }
        days++;
        curDate.setDate(curDate.getDate() + 1);
    }
    lbDatePicker['dates'] = dates;
}

function updateDefaultDeliveryDates() {
    var date = getIST();
    if (shopifyDs['cakeType'] == 'xpress' || shopifyDs['cakeType'] === 'plum') {
        var hourReq = 3;
        if (shopifyDs['cakeVariant'] == 'eggless') {
            var hourReq = 7;
        }
        delivery['date'] = date.getDate();
        delivery['hour'] = date.getHours() + hourReq;
        delivery['month'] = date.getMonth() + 1;
    } else if (shopifyDs['cakeType'] == 'signature' || shopifyDs['cakeType'] == 'addons') {
        delivery['date'] = date.getDate();
        delivery['hour'] = date.getHours() + 7;
        delivery['month'] = date.getMonth() + 1;
    } else {
        date.setDate(date.getDate() + 1);
        delivery['date'] = date.getDate();
        delivery['hour'] = date.getHours() + 1;
        delivery['month'] = date.getMonth() + 1;
    }
}
function getDefaultSlots() {
    var slots = {};
    slots["10:00"] = "10 - 11 am";
    slots["11:00"] = "11 - 12 pm (noon)";
    slots["12:00"] = "12 - 1 pm";
    slots["13:00"] = "1 - 2 pm";
    slots["14:00"] = "2 - 3 pm";
    slots["15:00"] = "3 - 4 pm";
    slots["16:00"] = "4 - 5 pm";
    slots["17:00"] = "5 - 6 pm";
    slots["18:00"] = "6 - 7 pm";
    slots["19:00"] = "7 - 8 pm";
    slots["20:00"] = "8 - 9 pm";
    lbDatePicker['data'] = {};
    lbDatePicker['data']['config'] = {};
    lbDatePicker['data']['config']['slots'] = slots;
    lbDatePicker['data']['config']['enableSlotChecks'] = false;
    lbDatePicker['data']['config']['defaultDateTimeChecks'] = false;
}


//For error reporting
// Pure JavaScript errors handler
window.addEventListener('error', function (err) {
    var lineAndColumnInfo = err.colno ? ' line:' + err.lineno +', column:'+ err.colno : ' line:' + err.lineno;
    ga(
        'send',
        'event',
        'JavaScript Error',
        err.message,
        err.filename + lineAndColumnInfo + ' -> ' +  navigator.userAgent,
        0,
        true
    );
});


function submitAction(event) {

    if (shopifyDs['submitType'] != 'checkout') {
        return true;
    } else {
        shopifyDs['submitType'] = 'update';
    }

    if(myDateSelect.val() == 0 ||
        myCitySelect.val() == 'select' ||
        myTimeSelect.val() == 'select' ||
        myCitySelect.val() == 'loading') {
        event.preventDefault();
    } else {
        var notes = $('#lbdt-city option:selected').text() + " | " + $('#lbdt-date option:selected').text()
            + " | " + $('#lbdt-slots option:selected').text();
        notes = notes.replace("(noon)", "");
        shopifyDs['cartJson']['note'] = notes;
        //$.post('cart.js', shopifyDs['cartJson']);
        $.ajax({
            url: 'cart/update.js',
            type: 'POST',
            data: shopifyDs['cartJson'],
            async: false
        });

        var query = "?city=" + shopifyDs['city'] +
            "&date=" + myDateSelect.val().split(" ").join("") +
            "&slot=" + myTimeSelect.val() + "&notes=" + notes + "&price=" + shopifyDs['cartJson']['total_price'];
        var url = "/apps/order" + query;
        //$.get(url, function(data){});
        $.ajax({
            url: url,
            type: 'GET',
            async: false,
            timeout: 1000
        });

        /*
         * Google Analytics
         */
        var date = $('#lbdt-date option:selected').text();
        ga('send', {
            hitType: 'event',
            eventCategory: 'Date Picker',
            eventAction: 'Ordered Cake - ' + $('#lbdt-city option:selected').text(),
            eventLabel: date,
            eventValue: parseInt(myTimeSelect.val())
        });

        ga('send', {
            hitType: 'event',
            eventCategory: 'Date Picker',
            eventAction: 'Slot Selected',
            eventLabel: $('#lbdt-slots option:selected').text()
        });
        return true;
    }
}

{
    if ($('#lbdt').length > 0) {


        var myDateSelect = $('#lbdt-date');
        var myTimeSelect = $('#lbdt-slots');
        var myCitySelect = $('#lbdt-city');

        /*
         * Fetch available dates from backend
         */
        $.get("https://shopifyapp.azurewebsites.net/shopify/dates", function( data ) {
            lbDatePicker = data;
            myCitySelect.prop("disabled", false);
            updateCakeDs();
        }).fail(function(){
                getDefaultDates();
                getDefaultSlots();
                myCitySelect.prop("disabled", false);
                updateCakeDs();

                /*
                 * Google Analytics
                 */
                ga('send', {
                    hitType: 'event',
                    eventCategory: 'Date Picker',
                    eventAction: 'Loaded Default Slot Options',
                    eventLabel: 'Error while fetching dates from Date Picker'
                });
            });

        /*
         * Disable all select elements while backed returns the data
         */
        myDateSelect.find("option").remove();
        myCitySelect.find("option").remove();
        myTimeSelect.find('option').remove();
        myCitySelect.append(
            $('<option></option>').val("loading").html("Loading")
        );
        myCitySelect.prop("disabled", true);

        $('#checkout').click(function(event) {
            shopifyDs['submitType'] = "checkout";
        });

        $('#lbdt-submit').submit(function(event) {
            submitAction(event);
        })

        /*
         * When the city gets selected, show appropriate dates to order
         */
        myCitySelect.change(function(event) {

            /*
             * Enable the checkout button
             */
            $('#checkout').prop('disabled', false);

            if(myCitySelect.val().toString().indexOf("select") < 0) {

                shopifyDs['city'] = myCitySelect.val();

                var content = "";
                $('#lbdt-addons').html(content);

                if (shopifyDs['city'] == 'coimbatore' && shopifyDs['addons'] == false) {
                    var content = "<br>" +
                        "<a href=\"http://www.cakebee.in/collections/add-ons\"><b>Click here to order a bouquet</b></a>" +
                        " along with your cake, only available in Coimbatore.";

                     $('#lbdt-addons').html(content);

                }

                myDateSelect.find("option").remove();
                var dates = {};
                dates[0] = "Select date";

                $.each(getDates(), function(val, text){
                    dates[val] = text;
                });

                $.each(dates, function(val, text) {
                    myDateSelect.append(
                        $('<option></option>').val(val).html(text)
                    );
                });
            } else {
                myDateSelect.find("option").remove();
                myTimeSelect.find("option").remove();
            }
        });

        /*
         * When the date gets selected, show appropriate time slots
         */
        myDateSelect.change(function(event) {

            myTimeSelect.find("option").remove();

            selectedValue = $("#lbdt-date option:selected").text()
            if(selectedValue.indexOf("Select") < 0) {
                var timeOptions = {};
                timeOptions['select'] = "Select time slot";

                /*
                 * Hack for plum
                 */
                if (shopifyDs['cartJson']['items'].length == 1 && shopifyDs['cakeType'] == 'plum') {
                    var options = getSlots(myDateSelect.val());
                    if (options["12:00"] != null) {
                        timeOptions["12:00"] = "10 am - 2 pm";
                    }
                    if (options["17:00"] != null) {
                        timeOptions["17:00"] = "4 pm - 8 pm";
                    }
                } else {
                    $.each(getSlots(myDateSelect.val()), function(val, text){
                        timeOptions[val] = text;
                    });
                }

                /*
                 * Add options to the drop down list
                 */
                $.each(timeOptions, function(val, text) {
                    myTimeSelect.append(
                        $('<option></option>').val(val).html(text)
                    );
                });
            }
        });
    }
}

//loggly
/*var _LTracker = _LTracker || [];
_LTracker.push({
    'logglyKey': '7b9f6d3d-01ed-45c5-b4ed-e8d627764998',
    'sendConsoleErrors' : true,
    'tag' : 'loggly-jslogger'
});*/