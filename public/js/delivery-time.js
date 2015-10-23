console.log('Delivery Time JS loaded');

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
    //myCitySelect.val('select').prop("disabled", true);
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
    });

    console.log('This is the cart page');

    var myDateSelect = $('#lbdt-date');
	var myTimeSelect = $('#lbdt-slots');
    var myCitySelect = $('#lbdt-city');

	$.getJSON( 'cart.js', function( json ) {
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

	//Validation
	$('.button').click(function(event) {
	  	console.log('Checkout button clicked');
	  	if(myDateSelect.val() == 'NA') {
	  		event.preventDefault();
	  		console.log('Prevented default');
		} else {
			console.log('Usual flow');
		}
	});

    /*
     * When the city gets selected, show appropriate dates to order
     */
    myCitySelect.change(function(event) {

        if(myCitySelect.val().toString().indexOf("select") < 0) {
            console.log("Selected city");
            var dates = response.dates;
            dates['select'] = "Select date";

            myDateSelect.find("option").remove();

            $.each(dates, function(val, text) {
                myDateSelect.append(
                    $('<option></option>').val(val).html(text)
                );
                console.log('Days updated');
            });
        } else {
            myDateSelect.find("option").remove();
        }
    });

    /*
     * When the date gets selected, show appropriate time slots
     */
    myDateSelect.change(function(event) {

        myTimeSelect.find("option").remove();
        var timeOptions = response.data.config.slots;
        timeOptions['select'] = "Select time slot"
        $.each(timeOptions, function(val, text) {
            myTimeSelect.append(
                $('<option></option>').val(val).html(text)
            );
        });
        console.log('Time updated');
    });

} else {
	console.log('This is not the cart page');
}

