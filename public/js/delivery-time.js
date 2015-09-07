console.log('Delivery Time JS loaded');
//console.log($('body')[0]);
if ($('#lbdt').length > 0) {
	console.log('This is the cart page');

	//Ajax call to get the cart
	$.get("/cart.js", function(data, status){
	    alert('Data: ' + data + '\nStatus: ' + status);
	});

	var dateOptions = {
	    val1 : 'Sep 8, 2015',
	    val2 : 'Sep 9, 2015',
	    val3 : 'Sep 10, 2015',
	    val4 : 'Sep 11, 2015',
	    val5 : 'Sep 12, 2015'
	};
	var myDateSelect = $('#lbdt-day');
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
	var myTimeSelect = $('#lbdt-time');
	$.each(timeOptions, function(val, text) {
	    myTimeSelect.append(
	        $('<option></option>').val(val).html(text)
	    );
	});
	console.log('Time updated');

} else {
	console.log('This is not the cart page');
}

