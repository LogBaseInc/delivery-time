var lbDatePicker = {};
var delivery = {
    date: 0,
    hour: 0,
    month: 0
}

var shopifyDs = {
    cartJson: null,
    cakeVariant: null,
    cakeType: null,
    city: null
}

function loadCityValues() {
    var city = {
        select: "Select city",
        coimbatore: "Coimbatore",
        trichy: "Trichy"
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

    istDate.setDate(curDate + dayCount);
    delivery['date'] = istDate.getDate();
    delivery['month'] = istDate.getMonth() + 1;
    if (curhour > workStartTime && dayCount == 0) {
        delivery['hour'] = curhour + prepTime + 1;
    } else {
        delivery['hour'] = workStartTime + prepTime + 1;
    }
}

function checkForHoliday(dt) {
    var holiday = false;
    if (lbDatePicker['data']['config']['enableSlotChecks'] == false) {
        return false;
    }

    $.each(lbDatePicker.data.config.holidays, function(val, text) {
        if (text.toString().indexOf(dt) >= 0) {
            holiday = true;
        }
    });
    return holiday;
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
            if ((parseInt(date) >= delivery['date'] && parseInt(month) == delivery['month']) ||
                parseInt(month) > delivery['month']) {
                var freeSlots = getFreeSlotsForTheDay(date, month, year);
                if (freeSlots != {}) {
                    dates[val] = text;
                }
            }
        }
    });
    // TODO - need to handle case where we don't have a free slot at all
    return dates;
}

function getFreeSlotsForTheDay(date, month, year) {
    var slots = {};
    var slotDateFormat = year.toString() + month.toString() + date.toString();
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
            if (existingOrders == null || existingOrders < 3) {
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
            shopifyDs['cakeType'] = 'signature';
        } else {
            shopifyDs['cakeType'] = 'xpress';
        }

        updateFirstPossibleDeliveryDate();
        noteToCustomer();
        hideDeliverySlotForSampler();
    });
}

function hideDeliverySlotForSampler() {
    if (shopifyDs["cartJson"]["item_count"] > 1 || shopifyDs['cakeType'] != 'sampler') {
        $('#lbdt-slots-div').prop('hidden', false);
    }

    if (shopifyDs['cakeType'] == 'sampler') {
        var content = "<br>Our <b>Sampler Cakes</b> takes a day to deliver."
        $('#lbdt-note').html(content);
    }
}

function noteToCustomer() {
    /*
     * Note not required for xpress egg cakes
     */
    if (shopifyDs['cakeType'] == 'xpress' && shopifyDs['cakeVariant'] == 'egg') {
        return;
    }

    var prepTime = null;
    if (shopifyDs['cakeType'] == 'signature' || shopifyDs['cakeType'] == 'xpress') {
        prepTime = "6 hours";
    } else {
        prepTime = "1 day"
    }

    var cakeName;
    if (shopifyDs['cakeType'] == 'xpress') {
        cakeName = "Eggless Xpress"
    } else {
        cakeName = shopifyDs['cakeType'];
    }

    var content = "<br>Our <b><font style=\"text-transform: capitalize;\">" + cakeName +
        "</font> Cakes</b> takes " + prepTime + " to prepare. ";

    if (shopifyDs['cakeType'] != 'xpress') {
        content = content + "If you need the cakes to be delivered sooner, please choose our " +
        "<a href=\"http://www.cakebee.in/collections/bees-xpress\"><b>Xpress Cakes</b></a>.";
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
    var days = 0;
    var dates = {};
    var curDate = new Date();
    while(days < 7) {
        var idx = curDate.getFullYear().toString() + " " +
            (curDate.getMonth() + 1).toString() + " " +
            curDate.getDate().toString();
        dates[idx] = curDate.toDateString();
        days++;
        curDate.setDate(curDate.getDate() + 1);
    }
    lbDatePicker['dates'] = dates;
}

function updateDefaultDeliveryDates() {
    var date = getIST();
    if (shopifyDs['cakeType'] == 'xpress') {
        delivery['date'] = date.getDate();
        delivery['hour'] = date.getHours() + 3;
        delivery['month'] = date.getMonth() + 1;
    } else if (shopifyDs['cakeType'] == 'signature') {
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
    slots["11:00"] = "11 - 12 pm";
    slots["12:00"] = "12 - 1 pm";
    slots["13:00"] = "1 - 2 pm";
    slots["14:00"] = "2 - 3 pm";
    slots["15:00"] = "3 - 4 pm";
    slots["16:00"] = "4 - 5 pm";
    slots["17:00"] = "5 - 6 pm";
    slots["18:00"] = "6 - 7 pm";
    slots["19:00"] = "7 - 8 pm";
    slots["20:00"] = "8 - 9 pm";
    slots["24:00"] = "Midnight 11:45 - 12:00";
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

    if(myDateSelect.val() == 0 ||
        myCitySelect.val() == 'select' ||
        myTimeSelect.val() == 'select' ||
        myCitySelect.val() == 'loading') {
        event.preventDefault();
    } else {
        var notes = $('#lbdt-city option:selected').text() + " | " + $('#lbdt-date option:selected').text()
            + " | " + $('#lbdt-slots option:selected').text();
        shopifyDs['cartJson']['note'] = notes;
        //$.post('cart.js', shopifyDs['cartJson']);
        $.ajax({
            url: 'cart.js',
            type: 'POST',
            data: shopifyDs['cartJson'],
            async: false
        });

        var query = "?city=" + shopifyDs['city'] +
            "&date=" + myDateSelect.val().split(" ").join("") +
            "&slot=" + myTimeSelect.val();
        var url = "/apps/order" + query;
        //$.get(url, function(data){});
        $.ajax({
            url: url,
            type: 'GET',
            async: false
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
        $.get( "https://microsoft-apiapp54692aa0abc4415dbcbe3f2db1325121.azurewebsites.net/shopify/dates", function( data ) {
            lbDatePicker = data;
            myCitySelect.prop("disabled", false);
            loadCityValues();
            updateCakeDs();
        }).fail(function(){
                getDefaultDates();
                getDefaultSlots();
                myCitySelect.prop("disabled", false);
                loadCityValues();
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

        //Validation
/*        $('#checkout').click(function(event) {
            submitAction(event);
        });
*/
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
                 * Hack for sampler
                 */
                if (shopifyDs["cartJson"]["item_count"] == 1 && shopifyDs['cakeType'] == 'sampler') {
                    timeOptions["11:00"] = "10 am - 1 pm";
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