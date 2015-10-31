var orders = [];
var filterorders = [];

window.addEventListener("DOMContentLoaded", function() {

    $("#orderdiv").hide();
    $("#noorderdiv").hide();

    $.get( "/shopify/orders", function( data ) {
        for(var i=0; i< data.orders.length; i++) {
            var order = {};
            var notesplit = data.orders[i].note != null ? data.orders[i].note.split('|'): [];
            order.id = data.orders[i].id;
            order.link = "https://cake-bee.myshopify.com/admin/orders/"+order.id;
            order.name = data.orders[i].name;
            order.customername = data.orders[i].customer.first_name;
            order.orderdate = moment(data.orders[i].created_at).format('MMM DD, YYYY');
            order.deliverydate = notesplit.length >0 ? notesplit[1] : "";
            order.deliverytime = notesplit.length >0 ? notesplit[2]: "";
            order.address = data.orders[i].shipping_address.address1 + " " + data.orders[i].shipping_address.address2;
            order.status = data.orders[i].fulfillment_status == null ? "Pending" : data.orders[i].fulfillment_status;

            orders.push(order);
        }

        initialize();
    });
}, false);

function initialize () {
    var filterdates = [];
    var filterorders = [];
    for(var i=0; i< orders.length; i++) {
        if(orders[i].deliverydate != "" && orders[i].deliverydate != null && 
           orders[i].deliverydate != undefined && filterdates.indexOf(orders[i].deliverydate) < 0) {
            filterdates.push(orders[i].deliverydate);
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
        var selecteddate = $('#filter').val();
        setSelectedDateOrders(selecteddate);
    });
}

function setSelectedDateOrders(selecteddate) {
    filterorders = $.grep(orders, function(v) {
        return $.trim(v.deliverydate) == $.trim(selecteddate);
    });
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
            row.insertCell(0).innerHTML = '<a href="'+orderlist[i].link+'">'+orderlist[i].name+'</a>'
            row.insertCell(1).innerHTML = orderlist[i].customername;
            row.insertCell(2).innerHTML = orderlist[i].orderdate;
            row.insertCell(3).innerHTML = orderlist[i].deliverydate;
            row.insertCell(4).innerHTML = orderlist[i].deliverytime;
            row.insertCell(5).innerHTML = orderlist[i].address;
            row.insertCell(6).innerHTML = orderlist[i].status;
        }
    }
}

function SortByDate(a, b){
    var a1 = moment(a);
    var b1 = moment(b);

    return ((a1 > b1) ? -1 : ((a1 < b1) ? 1 : 0));
}