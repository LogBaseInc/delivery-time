console.log('Delivery Time JS loaded');
//console.log($('body')[0]);


if ($('#lbdt').length > 0) {

    $.get( "https://microsoft-apiapp54692aa0abc4415dbcbe3f2db1325121.azurewebsites.net/shopify/dates", function( data ) {
        response = data;
        console.log(response);
    });

    console.log('This is the cart page');

    var myDateSelect = $('#lbdt-date');
	var myTimeSelect = $('#lbdt-slots');

	$.getJSON( 'cart.js', function( json ) {
	  	console.log( 'JSON Data: ' + json );
	});

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
    $('#lbdt-city').change(function(event) {

        console.log("Selected city");

        var dates = response.dates;
        myDateSelect.find("option").remove();

        $.each(dates, function(val, text) {
            myDateSelect.append(
                $('<option></option>').val(val).html(text)
            );
            console.log('Days updated');
        });
    });

    /*
     * When the date gets selected, show appropriate time slots
     */
    $('#lbdt-date').change(function(event) {

        myTimeSelect.find("option").remove();
        var timeOptions = response.data.config.slots;
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

