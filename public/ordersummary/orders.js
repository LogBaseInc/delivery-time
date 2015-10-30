var orders = [];

window.addEventListener("DOMContentLoaded", function() {

    document.getElementById("ordertable").style.display = "none";

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

        listOrders();
    });
}, false);

function listOrders () {
    var table = document.getElementById('ordertable').getElementsByTagName('tbody')[0];

    for(var i=0; i< orders.length; i++) {
        var rowCount = table.rows.length;
        var row = table.insertRow(rowCount);
        row.insertCell(0).innerHTML = '<a href="'+orders[i].link+'">'+orders[i].name+'</a>'
        row.insertCell(1).innerHTML = orders[i].customername;
        row.insertCell(2).innerHTML = orders[i].orderdate;
        row.insertCell(3).innerHTML = orders[i].deliverydate;
        row.insertCell(4).innerHTML = orders[i].deliverytime;
        row.insertCell(5).innerHTML = orders[i].address;
        row.insertCell(6).innerHTML = orders[i].status;
    }

    document.getElementById("loadimg").style.display = "none";
    document.getElementById("ordertable").style.display = null;

}