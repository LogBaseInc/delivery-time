var orders = [];
var filterorders = [];
var selecteddate;
var selectedcity = "All";
var selectedstatus = "All";
var unfilterCityOrders = [];
var unfilterStatusOrders = [];
var todaydate;
var firebaseorders = [];
var selectedorderinfo = null;
var selectedorderid = null;
var selectedorderbutton = null;
var devices = [];

window.addEventListener("DOMContentLoaded", function() {
    $("#dialog").dialog({
        modal: true,
        draggable: false,
        resizable: false,
        autoOpen: false,
        hide: {
            effect: "explode",
            duration: 500
        },
        width: 400,
        dialogClass: 'ui-dialog-osx',
        buttons: {
            "OK": function() {
                var selectedoption = document.querySelector('input[name="driver"]:checked');
                if(selectedoption != null) {
                    var date = moment(new Date()).format("YYYYMMDD");
                    var firebase_url = "https://logbasedev.firebaseio.com/accounts/account060cf688-e0bb-4fbe-86cd-482a52772940/";
                    var firebase_ref = new Firebase(firebase_url + 'orders/'+ selectedoption.value + "/" + date + "/" + selectedorderid);
                    firebase_ref.set(selectedorderinfo , function() {
                        //alert("Order assigned to driver");
                    });

                    firebase_ref = new Firebase(firebase_url +'unassignorders/'+ date + "/" + selectedorderid+ "/deviceid");
                    firebase_ref.set(selectedoption.value);
                    selectedorderinfo = null;
                    selectedorderid = null;
                    selectedorderbutton.html('Undo');
                    selectedorderbutton = null;
                }
                $(this).dialog("close");
            }
        }
    });

    $("#orderdiv").hide();
    $("#noorderdiv").hide();
    $("#dialog-fulfillconfirm").hide();
    $("#dialog-paymentconfirm").hide();

    getDrivers();

    $.get("/shopify/orders", function( data ) {
        orders = [];
        setOrders(data);
        setInterval(tick, 2000);

        $.get( "/shopify/oldopenorders", function( opendata ) {
            setOrders(opendata);
        });
    });
}, false);

function tick() {
    //get the mins of the current time
    var mins = new Date().getMinutes();
    if(mins == "00" && selecteddate == todaydate){
        listOrders(filterorders);
     }
}


function setOrders(data) {
    for(var i=0; i< data.orders.length; i++) {
            if(data.orders[i].cancelled_at == null) {
                var order = {};
                var notesplit = data.orders[i].note != null ? data.orders[i].note.split('|'): [];
                var timetosort = "";
                var timesplit = "";
                if(notesplit.length >= 2) {
                    timesplit = notesplit[2].split('-');
                    if(timesplit.length < 2)
                        timesplit = notesplit[2].split('–');
                    var ispm = false;
                    if(timesplit[1].toLowerCase().indexOf('pm') >=0 && parseInt(timesplit[1]) >= 1 && parseInt(timesplit[1]) < 12 && 
                        timesplit[0] != 12) {
                        ispm = true;
                    }

                    timetosort = (isNaN(parseInt(timesplit[0])) ? 24 : (ispm ? (parseInt(timesplit[0])+12) : parseInt(timesplit[0])));
                }

                if(data.orders[i].shipping_address == undefined || data.orders[i].shipping_address == null)
                    console.log(data.orders[i]);
                if(timesplit.length >0 && ispm == false && parseInt(timesplit[0]) == 12) {
                    order.delivertimelimit = parseInt(timesplit[1])+12;
                }
                else {
                    order.delivertimelimit = timesplit.length >0 ? (ispm == true ? parseInt(timesplit[1])+12 : parseInt(timesplit[1])) : "";
                }
                order.id = data.orders[i].id;
                order.link = "https://cake-bee.myshopify.com/admin/orders/"+order.id;
                order.name = data.orders[i].name;
                order.customername = data.orders[i].customer.first_name + " " +data.orders[i].customer.last_name;
                order.orderdate = moment(data.orders[i].created_at).format('MMM DD, YYYY hh:mm a');
                order.city = notesplit.length >0 ? notesplit[0] : "";
                order.deliverydate = notesplit.length >0 ? $.trim(notesplit[1]).replace(/ +(?= )/g,'') : "";
                order.deliverytime = notesplit.length >0 ? notesplit[2]: "";
                order.timetosort = timetosort;
                order.address = "This order doesn't have shipping address.";
                if(data.orders[i].shipping_address != undefined && data.orders[i].shipping_address != null) {
                    order.address = data.orders[i].shipping_address.address1;
                    if(data.orders[i].shipping_address.address2 != null && data.orders[i].shipping_address.address2 != "")
                        order.address = order.address + ", " +data.orders[i].shipping_address.address2;
                    order.address = order.address + ", " + data.orders[i].shipping_address.city;
                    order.address = order.address + " - " + data.orders[i].shipping_address.zip;
                    order.phone = data.orders[i].shipping_address.phone;
                }
                
                order.fulfillmentstatus = data.orders[i].fulfillment_status == null ? "Pending" : data.orders[i].fulfillment_status;
                order.price = data.orders[i].total_price;
                order.openorclose = data.orders[i].closed_at != null ? "Closed" : "Open";
                order.financial_status = data.orders[i].financial_status;
                order.tag = data.orders[i].tags;
                order.iscod = (data.orders[i].gateway != null && (data.orders[i].gateway.indexOf('COD') >=0 || data.orders[i].gateway.indexOf('Cash on Delivery') >=0)) ? true: false;
                order.notes = getNotes(data.orders[i]);
                order.items = [];
                for(var j=0; j < data.orders[i].line_items.length; j++) {
                    var item = data.orders[i].line_items[j];
                    var message = null;
                    var messageDesc = "";
                    var prop = item['properties'];
                    if (prop != null && prop != undefined) {
                        for (var idx in prop) {
                            if (prop[idx]['name'].toString().indexOf("Message") >= 0) {
                                message = prop[idx]['value'];
                                message = message.replace(/\n/g, " ");
                                message = message.replace(/\r/g, " ");
                            }
                        }
                    }

                    if (message != null && message != undefined) {
                        messageDesc = "\nMESSAGE ON THE CAKE: " + message + "\n";
                    }

                    order.items.push(
                        {
                            Name: data.orders[i].line_items[j].title,
                            Description: data.orders[i].line_items[j].variant_title + " | Quantity: " +
                                data.orders[i].line_items[j].quantity + messageDesc
                        }
                    );
                }
                orders.push(order);
            }
        }

    initialize();
}

function getFirebaseOrders(deviceId) {
    //var date = moment(new Date()).format("YYYYMMDD");
    var firebase_url = "https://logbasedev.firebaseio.com/accounts/account060cf688-e0bb-4fbe-86cd-482a52772940/orders/";
    var firebase_ref = new Firebase(firebase_url + deviceId);
    firebase_ref.on("value", function(snapshot) {
        var orderdata = snapshot.val();
        for(datepro in orderdata) {
            var data = orderdata[datepro];
            for(property in data){
                //if(!(property.toString().contains("Logged"))) {
                    firebaseorders[property] = {};
                    firebaseorders[property].deviceId = deviceId;
                    firebaseorders[property].vehiclenumber = devices[deviceId];
                    firebaseorders[property].pickedon =  null;
                    if(data[property].Pickedon != undefined && data[property].Pickedon != null && 
                        data[property].Pickedon != ""){
                        firebaseorders[property].pickedon = moment(data[property].Pickedon).format("hh:mm a");
                    }
                    firebaseorders[property].deliveredon = null;
                    if(data[property].Deliveredon != undefined && data[property].Deliveredon != null && 
                        data[property].Deliveredon != ""){
                        firebaseorders[property].deliveredon = moment(data[property].Deliveredon).format("hh:mm a");
                    }
                //}
            }
        }
        if(selecteddate == todaydate)
            listOrders(filterorders);
    }, function (errorObject) {
       console.error("The read failed: " + errorObject.code);
    });
}

function getDrivers() {
    var firebase_ref = new Firebase("https://logbasedev.firebaseio.com/accounts/account060cf688-e0bb-4fbe-86cd-482a52772940/devices/" );
    firebase_ref.on("value", function(snapshot) {
        var dialog = $("#dialog");
        dialog.append("");
        var data = snapshot.val();
        devices = [];
        firebaseorders = [];

        for(property in data){
            dialog.append('<input type="radio" style="margin-top: 20px; font-size: 3em;" name="driver" value="' + property + '">' + data[property].vehiclenumber+ '</input></br>');
            getFirebaseOrders(property);
            devices[property] = data[property].vehiclenumber;
        }
    }, function (errorObject) {
       console.error("The read devices failed: " + errorObject.code);
    });
}

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

    todaydate = moment(new Date()).format("dddd MMM DD, YYYY");
    if(filterdates.indexOf(todaydate) < 0)
        filterdates.push(todaydate);

    filterdates.sort(SortByDate);
    filterdates.push("All");

    var sel = $("#filter");
    sel.empty();
    for(var j=0; j<filterdates.length; j++) {
        sel.append('<option value="' + filterdates[j] + '">' + filterdates[j]+ '</option></br>');
    }

    $("#orderdiv").show();
    $("#loadimg").hide();
    sel.val(todaydate).change();
    selecteddate = todaydate;
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
    if (selecteddate == "All") {
        unfilterCityOrders = $.grep(orders, function (v) {
            return $.trim(v.deliverydate) < $.trim(todaydate);
        });
    } else {
        unfilterCityOrders = $.grep(orders, function (v) {
            return $.trim(v.deliverydate) == $.trim(selecteddate);
        });
    }
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
            var id  = orderlist[i].name.replace("#", "");
            var rowCount = table.rows.length;
            var row = table.insertRow(rowCount);
            row.insertCell(0).innerHTML = '<a target="_blank" href="'+orderlist[i].link+'">'+orderlist[i].name+'</a>'
            row.insertCell(1).innerHTML = '<span>'+orderlist[i].customername+'</span><br/>'+orderlist[i].phone;
            row.insertCell(2).innerHTML = orderlist[i].deliverytime;
            row.insertCell(3).innerHTML = orderlist[i].price;
            row.insertCell(4).innerHTML = orderlist[i].address;
            var itemdesc = "";
            for(var j=0; j< orderlist[i].items.length; j++) {
                itemdesc = itemdesc+ "Item" + (j+1) +":" + orderlist[i].items[j].Name + " | " + orderlist[i].items[j].Description+"\n";
            }
            row.insertCell(5).innerHTML = itemdesc;
            row.insertCell(6).innerHTML = orderlist[i].tag;

            var status = "";
            if(orderlist[i].financial_status == "pending") {
                status = '<button class="unpaid-button">Unpaid</button><br/>';
            }
            if(orderlist[i].fulfillmentstatus == 'Pending') {
                status = status + '<button class="unfulfill-button">Unfulfilled</button><br/>';
            }
            else {
                status = status + 'Fulfilled';
            }

            row.insertCell(7).innerHTML = status;
            row.insertCell(8).innerHTML = orderlist[i].openorclose;
            row.insertCell(9).innerHTML = "<span></span>";
            var isclosed = orderlist[i].openorclose.indexOf('Closed') >=0 ? true : false;
            if(orderlist[i].city.indexOf('Coimbatore') >= 0) {
                if(selecteddate == todaydate && firebaseorders[id] == undefined) {
                    if(isclosed == false)
                        row.insertCell(9).innerHTML = '<button class="driver-button">Assign Driver</button>'
                }
                else if(firebaseorders[id] != undefined) {
                    var firebaseorder = firebaseorders[id];
                    var currenthour = (new Date()).getHours();
                    if(selecteddate == todaydate && firebaseorder.pickedon != null && (firebaseorder.deliveredon == null || firebaseorder.deliveredon == "")
                        && currenthour >= orderlist[i].delivertimelimit) {
                        row.insertCell(9).innerHTML = '<span style="font-weight:bold">'+ firebaseorder.vehiclenumber + '</span></br>' + '<span style="color:red"> Pickedon: </span><span style="font-weight:bold; color:red">'+ firebaseorder.pickedon + '</span>'
                    }
                    else if(firebaseorder.deliveredon != null)
                        row.insertCell(9).innerHTML = '<span style="font-weight:bold">'+ firebaseorder.vehiclenumber + '</span></br>' + '<span> Pickedon: </span><span style="font-weight:bold">'+ firebaseorder.pickedon + '</span></br>' + '<span> Deliveredon: </span><span style="font-weight:bold">'+ firebaseorder.deliveredon + '</span>' 
                    else if(firebaseorder.pickedon != null)
                        row.insertCell(9).innerHTML = '<span style="font-weight:bold">'+ firebaseorder.vehiclenumber + '</span></br>' + '<span> Pickedon: </span><span style="font-weight:bold">'+ firebaseorder.pickedon + '</span>'
                    else if(selecteddate == todaydate && isclosed == false)
                        row.insertCell(9).innerHTML = '<span style="font-weight:bold">'+ firebaseorder.vehiclenumber + '</span></br>' +'<button class="driver-button">Not yet picked</button>'
               } 
            }
        }

        $(".unfulfill-button").click(function() {
            var cell =  $(this).closest('td');
            var index = $(this).closest('td').parent()[0].sectionRowIndex;
            var order = filterorders[index];
            $("#dialog-fulfillconfirm").dialog({
                resizable: false,
                height:220,
                modal: true,
                buttons: {
                    "Yes": function() {
                        $.get("/shopify/order/fulfill/"+order.id, function( data ) {
                            order.fulfillmentstatus = 'fulfilled';

                            var status = "";
                            if(order.financial_status == "pending") {
                                status = '<button class="unpaid-button">Unpaid</button><br/>';
                            }                        
                            status = status + "Fulfilled";
                            cell.html(status);
                        });

                        $(this).dialog( "close" );
                    },
                    No: function() {
                        $(this).dialog( "close" );
                    }
                }
            });
        });

        $(".unpaid-button").click(function() {
            var cell =  $(this).closest('td');
            var index = $(this).closest('td').parent()[0].sectionRowIndex;
            var order = filterorders[index];

            $("#dialog-paymentconfirm").dialog({
                resizable: false,
                height:220,
                modal: true,
                buttons: {
                    "Yes": function() {
                        $.get("/shopify/order/makepayment/"+order.id, function( data ) {
                            order.financial_status = 'paid';

                            var status = "";
                            if(order.fulfillmentstatus == 'Pending') {
                                status = status + '<button class="unfulfill-button">Unfulfilled</button><br/>';
                            }
                            else {
                                status = status + 'Fulfilled';
                            }
                            cell.html(status);
                        });

                        $(this).dialog( "close" );
                    },
                    No: function() {
                        $(this).dialog( "close" );
                    }
                }
            });
        });

        $(".driver-button").click(function() {
           var index = $(this).closest('td').parent()[0].sectionRowIndex;
           var order = filterorders[index];
           var date = moment(new Date()).format("YYYYMMDD");
           selectedorderid  = order.name.replace("#", "");
           selectedorderinfo = null;

           if($(this).html() == 'Assign Driver'){
                //Assign order to driver
                selectedorderinfo = {};
                selectedorderinfo.Address = order.address;
                selectedorderinfo.Amount = 0;
                selectedorderinfo.Mobile = order.phone;
                selectedorderinfo.Name = order.customername;
                selectedorderinfo.Time = order.deliverytime;
                selectedorderinfo.Items = order.items;
                selectedorderinfo.Notes = order.notes;
                if(order.iscod == true && order.financial_status.indexOf('pending') >=0) {
                    selectedorderinfo.Amount = parseInt(order.price);
                }
                selectedorderbutton = $(this);
                $("#dialog").dialog( "open" );
           }
           else {
                //Delete order from driver
                var deviceId = firebaseorders[selectedorderid].deviceId;
                delete firebaseorders[selectedorderid];
                var firebase_url = "https://logbasedev.firebaseio.com/accounts/account060cf688-e0bb-4fbe-86cd-482a52772940/";
                var firebase_ref = new Firebase(firebase_url + "orders/" + deviceId + "/" + date + "/" + selectedorderid);
                firebase_ref.remove(function() {
                    //alert("Order removed from driver");
                });

                firebase_ref = new Firebase(firebase_url +'unassignorders/'+ date + "/" + selectedorderid+ "/deviceid");
                firebase_ref.remove();

                $(this).html('Assign Driver');
            }
        });
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


function getNotes(order) {

    var billing_details = "";
    var billing_address = order.billing_address;
    if (billing_address != null && billing_address != undefined) {
        if (billing_address.name != null && billing_address.name != undefined) {
            billing_details += billing_address.name;
        }

        if (billing_address.phone != null && billing_address.phone != undefined) {
            billing_details += " | " + billing_address.phone + "  \n\n";
        }

    }

    var notes = order['note'];
    if (notes == null || notes == undefined) {
        var finalNotes = "  \nOrdered by - " + billing_details + "\n ** " + order.id;
        return finalNotes;
    }

    var tokns = notes.split("|");
    var formatted_notes = "";
    var time_slt = tokns[2];
    for (var idx in tokns) {
        if (idx > 3) {
            formatted_notes += " | ";
        }
        if (idx > 2) {
            formatted_notes += tokns[idx];
        }
    }

    var finalNotes = time_slt + "  \nOrdered by - " + billing_details + formatted_notes + "\n ** " + order.id;
    return finalNotes;
}