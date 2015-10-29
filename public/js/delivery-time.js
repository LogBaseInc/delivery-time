var lbDatePicker = null;
var delivery = {
    date: 0,
    hour: 0
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
    var dayCount = 0
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

    delivery['date'] = curDate + dayCount;
    if (curhour > workStartTime && dayCount == 0) {
        delivery['hour'] = curhour + prepTime + 1;
    } else {
        delivery['hour'] = workStartTime + prepTime + 1;
    }
}


function getDates() {
    if (lbDatePicker.data.config.defaultDateTimeChecks) {
        var dates = {};
        $.each(lbDatePicker.dates, function(val, text) {
            // key format - "yyyy mm dd"
            var tokens = val.split(" ");
            var year = tokens[0];
            var month = tokens[1];
            var date = tokens[2];

            if(parseInt(date) >= delivery['date'] || parseInt(month) > getIST().getMonth()) {
                var freeSlots = getFreeSlotsForTheDay(date, month, year);
                if (freeSlots != {}) {
                    dates[val] = text;
                }
            }
        });
        // TODO - need to handle case where we don't have a free slot at all
        return dates;
    }
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
        slots = lbDatePicker.data.config.slots
    }
    if (lbDatePicker.data.config.defaultDateTimeChecks) {
        if (selDate == delivery['date']) {
            selectedSlots = {};
            $.each(slots, function(val, text) {
                console.log(val, text);
                if (parseInt(val) >= delivery['hour']) {
                    selectedSlots[val] = text;
                }
            });
            return selectedSlots;
        } else {
            return slots;
        }
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

        if (types.toString().indexOf("handcrafted") >= 0) {
            shopifyDs['cakeType'] = 'handcrafted';
        } else if(types.toString().indexOf("signature") >= 0) {
            shopifyDs['cakeType'] = 'signature';
        } else {
            shopifyDs['cakeType'] = 'xpress';
        }

        updateFirstPossibleDeliveryDate();
    });
}

if ($('#lbdt').length > 0) {

    /*
     * Fetch available dates from backend
     */
    $.get( "https://microsoft-apiapp54692aa0abc4415dbcbe3f2db1325121.azurewebsites.net/shopify/dates", function( data ) {
        lbDatePicker = data;
        console.log(lbDatePicker);
        myCitySelect.prop("disabled", false);
        loadCityValues();
        updateCakeDs();
    });

    var myDateSelect = $('#lbdt-date');
	var myTimeSelect = $('#lbdt-slots');
    var myCitySelect = $('#lbdt-city');

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


    /*
     * Enabled the button which is by default disabled on page load
     */
    $('#checkout').prop('disabled', false);

	//Validation
	$('#checkout').click(function(event) {
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
            var url = "https://microsoft-apiapp54692aa0abc4415dbcbe3f2db1325121.azurewebsites.net/shopify/order/" +
                shopifyDs['city'] + "/" + myDateSelect.val().split(" ").join("") + "/" + myTimeSelect.val();
            $.get( url, function( data ) {});
            event.preventDefault();
        }
	});

    /*
     * When the city gets selected, show appropriate dates to order
     */
    myCitySelect.change(function(event) {

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

            $.each(getSlots(myDateSelect.val()), function(val, text){
                timeOptions[val] = text;
            });

            $.each(timeOptions, function(val, text) {
                myTimeSelect.append(
                    $('<option></option>').val(val).html(text)
                );
            });
        }
    });
}

