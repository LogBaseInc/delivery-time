window.addEventListener("DOMContentLoaded", function() {
    listOrders();
}, false);

function listOrders () {
	var table = document.getElementById("ordertable");
	var rowCount = table.rows.length;

    var row = table.insertRow(rowCount);
    row.insertCell(0).innerHTML = "#1001";
    row.insertCell(1).innerHTML = "Kalai";
    row.insertCell(2).innerHTML = "Wednesday 28, October 2015";
    row.insertCell(3).innerHTML = "Friday 30, October 2015";
    row.insertCell(4).innerHTML = "12.00 PM - 2.00 PM";
    row.insertCell(5).innerHTML = "5,Bajanai kovil street, Masakalipalyam, Coimbatore - 641015";
    row.insertCell(6).innerHTML = "Pending";

    row = table.insertRow(rowCount+1);
    row.insertCell(0).innerHTML = "#1002";
    row.insertCell(1).innerHTML = "Kousik";
    row.insertCell(2).innerHTML = "Thrusday 29, October 2015";
    row.insertCell(3).innerHTML = "Friday 30, October 2015";
    row.insertCell(4).innerHTML = "2.00 PM - 4.00 PM";
    row.insertCell(5).innerHTML = "5,Bajanai kovil street, Masakalipalyam, Coimbatore - 641015";
    row.insertCell(6).innerHTML = "Pending";

}