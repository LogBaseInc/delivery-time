console.log('Delivery Time JS loaded');
var response = null;
var delivery = {
    date: 0,
    hour: 0
}
variant = 'egg';
type = 'xpress';

function loadCityValues() {
    city = {
        select: "Select city",
        coimbatore: "Coimbatore",
        trichy: "Trichy"
    }
    myCitySelect.find("option").remove();

    $.each(city, function(val, text) {
        myCitySelect.append(
            $('<option></option>').val(val).html(text)
        );
        console.log('City updated');
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
    dayCount = 0
    istDate = getIST();
    curDate = istDate.getDate();
    curhour = istDate.getHours();
    workStartTime = response.data.config.workStartTime;
    workingHoursPerDay = response.data.config.workingHoursPerDay;
    workStopTime = workStartTime + workingHoursPerDay;
    prepTime = response.data.config.cakeTypes[type].prepTime[variant];

    workingHoursLeftForDay = workStopTime - curhour;
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
    if (response.data.config.defaultDateTimeChecks) {
        dates = {};
        $.each(response.dates, function(val, text) {
            if(parseInt(text.match(/\d+/)[0]) >= delivery['date']) {
                dates[val] = text;
            }
        });
        return dates;
    }
}

function getSlots(selectedItem) {
    selDate = parseInt(selectedItem.match(/\d+/)[0]);
    if (response.data.config.defaultDateTimeChecks) {
        if (selDate == delivery['date']) {
            slots = {};
            configSlots = response.data.config.slots;
            $.each(configSlots, function(val, text) {
                console.log(val, text);
                if (parseInt(text) >= delivery['hour']) {
                    slots[val] = text;
                }
            });
        } else {
            return response.data.config.slots;
        }
    }
}

function getSortedOrderTimeSlots() {
    slots = [];
    $.each(response.data.config.slots, function(val, text) {
        slots.push(parseInt(val))
    });

    /*
     * The last order will always be midnight order. skip it
     */
    return slots.sort();
}

if ($('#lbdt').length > 0) {

    /*
     * Fetch available dates from backend
     */
    $.get( "https://microsoft-apiapp54692aa0abc4415dbcbe3f2db1325121.azurewebsites.net/shopify/dates", function( data ) {
        response = data;
        console.log(response);
        myCitySelect.prop("disabled", false);
        loadCityValues();
        updateFirstPossibleDeliveryDate();
    });

    console.log('This is the cart page');

    var myDateSelect = $('#lbdt-date');
	var myTimeSelect = $('#lbdt-slots');
    var myCitySelect = $('#lbdt-city');

    var jsonData = null;
	$.getJSON( 'cart.js', function( json ) {
        jsonData = json;
	  	console.log( 'JSON Data: ' + json );
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


    /*
     * Enabled the button which is by default disabled on page load
     */
    $('#checkout').prop('disabled', false);

	//Validation
	$('#checkout').click(function(event) {
	  	console.log('Checkout button clicked');
	  	if(myDateSelect.val() == 0 ||
            myCitySelect.val() == 'select' ||
            myTimeSelect.val() == 'select') {
	  		event.preventDefault();
	  		console.log('Prevented default');
		} else {
            var notes = $('#lbdt-city option:selected').text() + " | " + $('#lbdt-date option:selected').text()
                + " | " + $('#lbdt-slots option:selected').text();
            jsonData['note'] = notes;
            $.post('cart.js', jsonData);
			console.log('Usual flow');
		}
	});

    /*
     * When the city gets selected, show appropriate dates to order
     */
    myCitySelect.change(function(event) {

        if(myCitySelect.val().toString().indexOf("select") < 0) {
            console.log("Selected city");

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
                console.log('Days updated');
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

        if($("#lbdt-date option:selected").text().indexOf("Select") < 0) {
            var timeOptions = {};
            timeOptions['select'] = "Select time slot";

            $.each(getSlots($('#lbdt-date option:selected').text()), function(val, text){
                timeOptions[val] = text;
            });

            $.each(timeOptions, function(val, text) {
                myTimeSelect.append(
                    $('<option></option>').val(val).html(text)
                );
            });
            console.log('Time updated');
        }
    });

} else {
	console.log('This is not the cart page');
}

