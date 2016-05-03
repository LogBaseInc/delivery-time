var fburl = "https://lb-date-picker.firebaseio.com/"
var maxOrdersPerSlot = 4;
$(function() {
	getMaxOrdersPerSlot();

    $( "#datepicker").datepicker({
    	dateFormat: "dd/mm/yy",
    	minDate: new Date(),
    	onSelect: function(dateText) {
		   var datestr = getformatteddate();
		   getcbeslot(datestr);
		   gettrichyslot(datestr);
		}
    });
    $("#datepicker").datepicker("setDate", new Date());

   	var datestr = getformatteddate();
   	getcbeslot(datestr);
   	gettrichyslot(datestr);
});

function getMaxOrdersPerSlot(){
	var firebase_ref = new Firebase(fburl + "config/maxOrdersPerSlot");
    firebase_ref.on("value", function(snapshot) {
       maxOrdersPerSlot = snapshot.val();
    }, function (errorObject) {
       console.error("The read failed: " + errorObject.code);
    });
}

function getformatteddate() {
	var datesplit = $("#datepicker").val().split("/");
	return datesplit[2]+datesplit[1]+datesplit[0];
}

function getcbeslot(datestr) {
	var firebase_ref = new Firebase(fburl + "coimbatore/" + datestr);
    firebase_ref.on("value", function(snapshot) {
   		$("#cbetable > tbody").html("");
   		var data = snapshot.val();
   		parseData(data, document.getElementById('cbetable').getElementsByTagName('tbody')[0]);
       
    }, function (errorObject) {
       console.error("The read failed: " + errorObject.code);
    });
}

function gettrichyslot(datestr) {
	var firebase_ref = new Firebase(fburl + "trichy/" + datestr);
    firebase_ref.on("value", function(snapshot) {
   		$("#trichytable > tbody").html("");
   		var data = snapshot.val();
   		parseData(data, document.getElementById('trichytable').getElementsByTagName('tbody')[0]);
       
    }, function (errorObject) {
       console.error("The read failed: " + errorObject.code);
    });
}

function parseData(data, table) {
    var row = table.insertRow(0);
    row.insertCell(0).innerHTML = '<span style="font-weight: bold;">Time Slot</span>';
    for(var i = 1; i <= maxOrdersPerSlot; i++) {
        row.insertCell(i).innerHTML = '<span style="font-weight: bold;">'+i+'</span>';
    }

	for(var t=10; t <= 20; t++) {
		var slot = "";
		
		var slotcount = data != null && data != undefined && data != "" ? data[t+":00"] : 0;
		if(slotcount == null || slotcount == undefined || slotcount == "") 
			slotcount = 0;

		//Format time
		var starttime = t;
		var endtime = starttime+1;

		if(starttime > 12) {
			starttime = starttime - 12;
		}

		slot = starttime+":00";

		if(endtime >= 12) {
			endtime = endtime != 12 ? endtime - 12 : endtime;
			slot = slot +" - "+endtime+":00 PM";
		}
		else {
			slot = slot +" - "+endtime+":00 AM";
		}

		//Add to table
		var rowCount = table.rows.length;
        var row = table.insertRow(rowCount);
        row.insertCell(0).innerHTML = '<span>'+slot+'</span>'
        for(var i = 1; i <= maxOrdersPerSlot; i++) {
            row.insertCell(i).innerHTML = i <= slotcount ? '<span class="badge"></span>' : '';
        }
	    
	}
}


