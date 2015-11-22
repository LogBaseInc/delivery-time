var orders = [];
var filterorders = [];
var selecteddate;
var selectedcity = "All";
var selectedstatus = "All";
var unfilterCityOrders = [];
var unfilterStatusOrders = [];

window.addEventListener("DOMContentLoaded", function() {

    $("#orderdiv").hide();
    $("#noorderdiv").hide();

    $.get( "/shopify/orders", function( data ) {
        for(var i=0; i< data.orders.length; i++) {
            if(data.orders[i].cancelled_at == null) {
                var order = {};
                var notesplit = data.orders[i].note != null ? data.orders[i].note.split('|'): [];
                var timetosort = "";
                if(notesplit.length >= 2) {
                    var timesplit = notesplit[2].split('-');
                    var ispm = false;
                    if(timesplit[1].toLowerCase().indexOf('pm') >=0 && parseInt(timesplit[0]) >= 1 && parseInt(timesplit[0]) <= 8) {
                        ispm = true;
                    }

                    timetosort = (isNaN(parseInt(timesplit[0])) ? 24 : (ispm ? (parseInt(timesplit[0])+12) : parseInt(timesplit[0])));
                }

                if(data.orders[i].shipping_address == undefined || data.orders[i].shipping_address == null)
                    console.log(data.orders[i]);

                order.id = data.orders[i].id;
                order.link = "https://cake-bee.myshopify.com/admin/orders/"+order.id;
                order.name = data.orders[i].name;
                order.customername = data.orders[i].customer.first_name;
                order.orderdate = moment(data.orders[i].created_at).format('MMM DD, YYYY');
                order.city = notesplit.length >0 ? notesplit[0] : "";
                order.deliverydate = notesplit.length >0 ? $.trim(notesplit[1]).replace(/ +(?= )/g,'') : "";
                order.deliverytime = notesplit.length >0 ? notesplit[2]: "";
                order.timetosort = timetosort;
                order.address = (data.orders[i].shipping_address != undefined && data.orders[i].shipping_address != null) ? 
                                 data.orders[i].shipping_address.address1 + " " + data.orders[i].shipping_address.address2 : "This order doesn't have shipping address.";
                order.status = data.orders[i].fulfillment_status == null ? "Pending" : data.orders[i].fulfillment_status;
                order.price = data.orders[i].total_price;
                order.openorclose = data.orders[i].closed_at != null ? "Closed" : "Open";

                orders.push(order);
            }
        }

        initialize();
    });
}, false);

function initialize () {
    var filterdates = [];
    var filterorders = [];
    for(var i=0; i< orders.length; i++) {
        var deliverdate = $.trim(orders[i].deliverydate).replace(/ +(?= )/g,'');
        if(deliverdate != "" && deliverdate != null && 
           deliverdate != undefined && filterdates.indexOf(deliverdate) < 0) {
            filterdates.push(deliverdate);
        }
    }

    var todaydate = moment(new Date()).format("dddd MMM DD, YYYY");
    if(filterdates.indexOf(todaydate) < 0)
        filterdates.push(todaydate);

    filterdates.sort(SortByDate);

    var sel = $("#filter");
    sel.empty();
    for(var j=0; j<filterdates.length; j++) {
        sel.append('<option value="' + filterdates[j] + '">' + filterdates[j]+ '</option>');
    }

    $("#orderdiv").show();
    $("#loadimg").hide();
    sel.val(todaydate).change();
    setSelectedDateOrders(todaydate);

    $("#filter").change(function() {
        selecteddate = $('#filter').val();
        setSelectedDateOrders(selecteddate);
    });

    $("#cityfilter").change(function() {
        selectedcity = $('#cityfilter').val();
        setSelectedCityOrders();
    });

    $("#openorclosedfilter").change(function() {
        selectedstatus = $('#openorclosedfilter').val();
        setSelectedStatusOrders();
    });
}

function setSelectedDateOrders(selecteddate) {
    unfilterCityOrders = $.grep(orders, function(v) {
        return $.trim(v.deliverydate) == $.trim(selecteddate);
    });
    setSelectedCityOrders();
}

function setSelectedCityOrders() {
    if(selectedcity == "All") {
        unfilterStatusOrders = unfilterCityOrders;
    }
    else {
        unfilterStatusOrders = $.grep(unfilterCityOrders, function(v) {
            return $.trim(v.city) == $.trim(selectedcity);
        });
    }
    setSelectedStatusOrders();
}

function setSelectedStatusOrders() {
    if(selectedstatus == "All") {
        filterorders = unfilterStatusOrders;
    }
    else {
        filterorders = $.grep(unfilterStatusOrders, function(v) {
            return $.trim(v.openorclose) == $.trim(selectedstatus);
        });
    }

    filterorders.sort(SortByTime);
    listOrders(filterorders);
}

function listOrders (orderlist) {
    if(orderlist.length == 0) {
        $("#ordertable").hide();
        $("#noorderdiv").show();
    }
    else {
        $("#ordertable").show();
        $("#noorderdiv").hide();

        var table = document.getElementById('ordertable').getElementsByTagName('tbody')[0];
        var filterdates = [];
        $("#ordertable > tbody").html("");

        for(var i=0; i< orderlist.length; i++) {
            var rowCount = table.rows.length;
            var row = table.insertRow(rowCount);
            row.insertCell(0).innerHTML = '<a target="_blank" href="'+orderlist[i].link+'">'+orderlist[i].name+'</a>'
            row.insertCell(1).innerHTML = orderlist[i].customername;
            row.insertCell(2).innerHTML = orderlist[i].orderdate;
            row.insertCell(3).innerHTML = orderlist[i].deliverydate;
            row.insertCell(4).innerHTML = orderlist[i].deliverytime;
            row.insertCell(5).innerHTML = orderlist[i].price;
            row.insertCell(6).innerHTML = orderlist[i].address;
            row.insertCell(7).innerHTML = orderlist[i].city;
            row.insertCell(8).innerHTML = orderlist[i].status;
            row.insertCell(9).innerHTML = orderlist[i].openorclose;
        }
    }
}

function SortByDate(a, b){
    var a1 = moment(a);
    var b1 = moment(b);

    return ((a1 > b1) ? -1 : ((a1 < b1) ? 1 : 0));
}

function SortByTime(a, b){
    var a1 = parseInt(a.timetosort);
    var b1 = parseInt(b.timetosort);

    return ((b1 > a1) ? -1 : ((b1 < a1) ? 1 : 0));
}