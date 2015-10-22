console.log('Delivery Time JS loaded');
//console.log($('body')[0]);

if ($('#lbdt').length > 0) {

    console.log('This is the cart page');

    var delivaryDates = null;
    var my_firebase_ref = new Firebase("https://lb-date-picker.firebaseio.com/config");
    var configs = null;
    my_firebase_ref.once("value", function(snapshot) {
        configs = snapshot.exportVal();
        var dates = {};
        maxDays = configs.maxDaysLimitForOrders
        console.log(maxDays);
        while (maxDays) {
            var d = Date.today().addDays(maxDays - 1);
            dates[maxDays] = d.toString("MMM dd,yyyy");
            maxDays--;
        }
        console.log(dates);
        delivaryDates = dates;
    });

    var myDateSelect = $('#lbdt-date');
	var myTimeSelect = $('#lbdt-slots');

	//Specific to CakeBee theme
	//myDateSelect.removeClass('hidden-field');
	//myTimeSelect.removeClass('hidden-field');
	//myDateSelect.css('outline', 'none');
	//myTimeSelect.css('outline', 'none');
	//$('.custom.dropdown').css({'visibility':'hidden', 'position':'absolute'});
	//ends

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

    $('#lbdt-city').change(function(event) {
        console.log("Selected city");
        dateOptions = delivaryDates;

        myDateSelect.each(function() {
            $(this).remove();
        })

        $.each(dateOptions, function(val, text) {
            myDateSelect.append(
                $('<option></option>').val(val).html(text)
            );
        });
        console.log('Days updated');

        var timeOptions = {
            val1 : '11 am - 12 pm',
            val2 : '2 pm - 3 pm',
            val3 : '5 pm - 6 pm',
            val4 : '8 pm - 9pm',
            val5 : 'Midnight 12 am'
        };

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

