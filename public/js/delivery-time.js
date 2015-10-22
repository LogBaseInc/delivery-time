console.log('Delivery Time JS loaded');
//console.log($('body')[0]);
var my_firebase_ref = new Firebase("https://lb-date-picker.firebaseio.com/config");
var configs = null;

if ($('#lbdt').length > 0) {

    console.log('This is the cart page');

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
            myDateSelect.find("option").remove();

            $.each(dates, function(val, text) {
                myDateSelect.append(
                    $('<option></option>').val(val).html(text)
                );
            });
            console.log('Days updated');

        });
    });

    $('#lbdt-date').change(function(event) {

        var timeOptions = configs.slots;
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

